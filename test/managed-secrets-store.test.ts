/* Encrypted-at-rest credential file: AES-256-GCM roundtrip, wrong-key
 * failure (surfaced as "undecryptable"), header-bound AAD, key strength,
 * no plaintext downgrade, serialised read-modify-write. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hashText } from "@/lib/managed-traefik";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  envFilePath,
  isSecretsEncryptionEnabled,
  materializeManagedSecrets,
  secretsEnvStatus,
  isSecretsUndecryptableError,
  probeManagedSecrets,
  readManagedSecrets,
  SecretsUndecryptableError,
  updateManagedSecrets,
  writeManagedSecrets,
} from "@/lib/managed-secrets-store";

const KEY_ONE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_TWO = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

let dir: string;
let mountDir: string; // stands in for the tmpfs volume shared with Traefik
let file: string;
let envFile: string;

beforeEach(() => {
  // mkdtempSync is fine in tests (the Math.random/Date restriction is workflow-only)
  dir = mkdtempSync(join(tmpdir(), "managed-secrets-"));
  mountDir = mkdtempSync(join(tmpdir(), "managed-secrets-mount-"));
  file = join(dir, "creds.enc");
  envFile = join(mountDir, "traefik.env");
  vi.stubEnv("MANAGED_SECRETS_FILE", file);
  vi.stubEnv("MANAGED_SECRETS_ENV_FILE", envFile);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  rmSync(mountDir, { recursive: true, force: true });
});

describe("managed-secrets-store", () => {
  it("missing file reads as empty", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    expect(await readManagedSecrets()).toEqual({});
    expect(await probeManagedSecrets()).toEqual({ undecryptable: false });
  });

  it("encrypts at rest (v2 envelope) and round-trips with the key", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    expect(isSecretsEncryptionEnabled()).toBe(true);

    const secrets = { CF_DNS_API_TOKEN: "super-secret-value", AWS_SECRET_ACCESS_KEY: "another/secret+val" };
    await writeManagedSecrets(secrets);

    // the value must NOT appear in plaintext on disk
    const onDisk = readFileSync(file, "utf8");
    expect(onDisk).not.toContain("super-secret-value");
    expect(onDisk).not.toContain("another/secret+val");
    const env = JSON.parse(onDisk);
    expect(env.alg).toBe("aes-256-gcm");
    expect(env.v).toBe(2);

    expect(await readManagedSecrets()).toEqual(secrets);
    // no temp files left behind
    expect(readdirSync(dir)).toEqual(["creds.enc"]);
  });

  it("a wrong key fails closed as SecretsUndecryptableError rather than returning empty", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    await writeManagedSecrets({ CF_DNS_API_TOKEN: "x" });
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_TWO);
    await expect(readManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
    await expect(readManagedSecrets()).rejects.toSatisfy(isSecretsUndecryptableError);
    expect(await probeManagedSecrets()).toEqual({ undecryptable: true });
  });

  it("binds the envelope header as AAD: tampering with v/alg fails the tag", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    await writeManagedSecrets({ CF_DNS_API_TOKEN: "x" });
    const env = JSON.parse(readFileSync(file, "utf8"));
    // v1 files (written without AAD) are not readable either — documented break
    writeFileSync(file, JSON.stringify({ ...env, v: 1 }));
    await expect(readManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
    // a v2 file whose header was edited after encryption must fail the tag
    writeFileSync(file, JSON.stringify({ ...env, v: 2, alg: "aes-256-gcm", data: env.data.slice(0, -4) + "AAAA" }));
    await expect(readManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
  });

  it("refuses a plaintext file once a key is configured (no silent downgrade)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeManagedSecrets({ CF_DNS_API_TOKEN: "plain-value" });
    expect(JSON.parse(readFileSync(file, "utf8")).alg).toBe("plain");
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    await expect(readManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
    expect(await probeManagedSecrets()).toEqual({ undecryptable: true });
    warn.mockRestore();
  });

  it("falls back to plaintext (with a warning) when no key is set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isSecretsEncryptionEnabled()).toBe(false);
    await writeManagedSecrets({ CF_DNS_API_TOKEN: "plain-value" });
    expect(JSON.parse(readFileSync(file, "utf8")).alg).toBe("plain");
    expect(await readManagedSecrets()).toEqual({ CF_DNS_API_TOKEN: "plain-value" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects a weak MANAGED_SECRETS_KEY loudly at first use", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", "short-key");
    expect(() => isSecretsEncryptionEnabled()).toThrow(/at least 32 characters/);
    await expect(writeManagedSecrets({ A: "1" })).rejects.toThrow(/MANAGED_SECRETS_KEY is too short/);
    vi.stubEnv("MANAGED_SECRETS_KEY", "x".repeat(32));
    expect(isSecretsEncryptionEnabled()).toBe(true);
  });

  it("round-trips an empty map", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    await writeManagedSecrets({});
    expect(await readManagedSecrets()).toEqual({});
  });

  it("corrupt files surface as undecryptable, other I/O errors propagate as-is", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
    writeFileSync(file, "{not json");
    await expect(readManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
    writeFileSync(file, JSON.stringify({ v: 2, alg: "aes-256-gcm" }));
    await expect(readManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
    writeFileSync(file, "   ");
    expect(await readManagedSecrets()).toEqual({});
  });

  describe("updateManagedSecrets", () => {
    it("hands the current map to the mutator and persists its result", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await writeManagedSecrets({ A: "1" });
      const out = await updateManagedSecrets((cur) => ({ ...cur!, B: "2" }));
      expect(out).toEqual({ A: "1", B: "2" });
      expect(await readManagedSecrets()).toEqual({ A: "1", B: "2" });
    });

    it("hands null when undecryptable; returning null leaves the file untouched", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await writeManagedSecrets({ A: "1" });
      const before = readFileSync(file, "utf8");
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_TWO);
      const seen: unknown[] = [];
      const out = await updateManagedSecrets((cur) => {
        seen.push(cur);
        return null;
      });
      expect(seen).toEqual([null]);
      expect(out).toBeNull();
      expect(readFileSync(file, "utf8")).toBe(before);
      // ...while a reset (start from {}) overwrites it under the new key
      await updateManagedSecrets((cur) => (cur === null ? { NEW: "v" } : cur));
      expect(await readManagedSecrets()).toEqual({ NEW: "v" });
    });

    it("serialises concurrent read-modify-writes so no edit is lost", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await writeManagedSecrets({});
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          updateManagedSecrets(async (cur) => {
            await new Promise((r) => setTimeout(r, 2));
            return { ...cur!, [`K${i}`]: String(i) };
          })
        )
      );
      expect(Object.keys(await readManagedSecrets()).sort()).toEqual(
        Array.from({ length: 8 }, (_, i) => `K${i}`).sort()
      );
      expect(readdirSync(dir)).toEqual(["creds.enc"]);
    });

    it("a throwing mutator does not wedge the lock", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await expect(
        updateManagedSecrets(() => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
      expect(await updateManagedSecrets(() => ({ OK: "1" }))).toEqual({ OK: "1" });
    });
  });

  describe("materialised env file (shared tmpfs mount)", () => {
    it("every write also (re)writes the plaintext env file, 0600, sourceable", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      expect(envFilePath()).toBe(envFile);
      await writeManagedSecrets({ CF_DNS_API_TOKEN: "tok'en", ZZ: "1" });
      const body = readFileSync(envFile, "utf8");
      expect(body).toBe("export CF_DNS_API_TOKEN='tok'\\''en'\nexport ZZ='1'\n");
      expect(statSync(envFile).mode & 0o777).toBe(0o600);
      // the encrypted store itself never contains the plaintext
      expect(readFileSync(file, "utf8")).not.toContain("tok'en");
      const st = await secretsEnvStatus();
      expect(st.materialized).toBe(true);
      expect(st.writtenAt).not.toBeNull();
      expect(st.hash).toBe(hashText(body));
    });

    it("removing the last credential leaves an empty env file (Traefik restarts without it)", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await writeManagedSecrets({ A: "1" });
      await writeManagedSecrets({});
      expect(readFileSync(envFile, "utf8")).toBe("");
    });

    it("materializeManagedSecrets rebuilds the env file from the store (after a reboot wipes the tmpfs)", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await writeManagedSecrets({ A: "1" });
      rmSync(envFile);
      expect((await secretsEnvStatus()).materialized).toBe(false);
      const st = await materializeManagedSecrets();
      expect(st.materialized).toBe(true);
      expect(readFileSync(envFile, "utf8")).toBe("export A='1'\n");
    });

    it("an undecryptable store throws and leaves an existing env file untouched", async () => {
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_ONE);
      await writeManagedSecrets({ A: "1" });
      vi.stubEnv("MANAGED_SECRETS_KEY", KEY_TWO);
      await expect(materializeManagedSecrets()).rejects.toBeInstanceOf(SecretsUndecryptableError);
      expect(readFileSync(envFile, "utf8")).toBe("export A='1'\n");
    });

    it("secretsEnvStatus is non-throwing when the mount is empty", async () => {
      const st = await secretsEnvStatus();
      expect(st).toEqual({ path: envFile, materialized: false, writtenAt: null, hash: null });
    });
  });
});
