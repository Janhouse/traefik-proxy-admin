import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

// Exercise the actual POSIX wrapper with deterministic stand-ins for its two
// external processes. Real sleeps preserve its grace/cooldown state machine.
const running: { root: string; child: ChildProcess }[] = [];
afterEach(async () => {
  for (const { root, child } of running.splice(0)) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGTERM");
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
});

async function launch(lastGood?: string, candidate = "candidate\n") {
  const root = await mkdtemp(path.join(tmpdir(), "managed-wrapper-"));
  await mkdir(path.join(root, "bin"));
  await mkdir(path.join(root, "good"));
  await writeFile(path.join(root, "candidate"), candidate);
  await writeFile(path.join(root, "secrets"), "");
  if (lastGood) {
    await writeFile(path.join(root, "good/traefik.yml.last-good"), lastGood);
    await writeFile(path.join(root, "config"), lastGood);
  }
  await writeFile(path.join(root, "bin/wget"), `#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -O) out="$2"; shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$TEST_ROOT/requests"
cp "$TEST_ROOT/candidate" "$out"
`, { mode: 0o755 });
  await writeFile(path.join(root, "bin/traefik"), `#!/bin/sh
cat "$2" >> "$TEST_ROOT/starts"
printf '\\n---\\n' >> "$TEST_ROOT/starts"
if [ -f "$TEST_ROOT/fail-next" ]; then
  rm "$TEST_ROOT/fail-next"
  exit 1
fi
exec sleep 300
`, { mode: 0o755 });
  const child = spawn("sh", [path.resolve("docker/managed/traefik-wrapper.sh")], {
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      TEST_ROOT: root,
      CONFIG_FILE: `${root}/config`,
      ENV_FILE: `${root}/env`,
      SECRETS_ENV_SRC: `${root}/secrets`,
      LAST_GOOD_DIR: `${root}/good`,
      POLL_SECONDS: "1",
      GRACE_SECONDS: "1",
      RETRY_SECONDS: "3",
    },
    stdio: "pipe",
  });
  running.push({ root, child });
  let logs = "";
  child.stdout?.on("data", (data) => { logs += data; });
  child.stderr?.on("data", (data) => { logs += data; });
  return { root, logs: () => logs };
}

async function eventually(check: () => Promise<void>, logs: () => string) {
  const deadline = Date.now() + 12_000;
  while (true) {
    try { await check(); return; } catch (error) {
      if (Date.now() >= deadline) throw new Error(`${error}\n${logs()}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

it("reports a matching last-good config on the first restart heartbeat", async () => {
  const config = "proven\n";
  const { root, logs } = await launch(config, config);
  const hash = createHash("sha256").update(config).digest("hex");
  await eventually(async () => {
    const requests = await readFile(`${root}/requests`, "utf8");
    expect(requests.split("\n")[0]).toContain(`?applied=${hash}`);
    expect(await readFile(`${root}/starts`, "utf8")).toContain(config);
  }, logs);
}, 15_000);

it.each([true, false])("retries identical rejected bytes after cooldown (last-good: %s)", async (hasLastGood) => {
  const { root, logs } = await launch(hasLastGood ? "proven\n" : undefined, "initial\n");
  await eventually(async () => {
    expect(await readFile(`${root}/good/traefik.yml.last-good`, "utf8")).toBe("initial\n");
  }, logs);
  if (!hasLastGood) await rm(`${root}/good/traefik.yml.last-good`);
  await writeFile(`${root}/fail-next`, "");
  await writeFile(`${root}/candidate`, "transient-failure\n");
  await eventually(async () => {
    expect(await readFile(`${root}/config.rejected`, "utf8")).toBe("transient-failure\n");
    const config = await readFile(`${root}/config`, "utf8");
    expect(config).toContain(hasLastGood ? "initial" : "websecure:");
    expect(logs()).toContain(hasLastGood ? "rolled back" : "minimal fallback");
  }, logs);
  await eventually(async () => {
    expect(await readFile(`${root}/good/traefik.yml.last-good`, "utf8")).toBe("transient-failure\n");
    expect(logs()).toContain("cooldown elapsed");
  }, logs);
}, 20_000);
