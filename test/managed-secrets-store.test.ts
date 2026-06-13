/* Encrypted-at-rest credential file: AES-256-GCM roundtrip, wrong-key
 * failure, and plaintext fallback when no key is configured. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isSecretsEncryptionEnabled,
  readManagedSecrets,
  writeManagedSecrets,
} from "@/lib/managed-secrets-store";

let dir: string;
let file: string;

beforeEach(() => {
  // mkdtempSync is fine in tests (the Math.random/Date restriction is workflow-only)
  dir = mkdtempSync(join(tmpdir(), "managed-secrets-"));
  file = join(dir, "creds.enc");
  vi.stubEnv("MANAGED_SECRETS_FILE", file);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("managed-secrets-store", () => {
  it("missing file reads as empty", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", "k");
    expect(await readManagedSecrets()).toEqual({});
  });

  it("encrypts at rest and round-trips with the key", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", "a-strong-key");
    expect(isSecretsEncryptionEnabled()).toBe(true);

    const secrets = { CF_DNS_API_TOKEN: "super-secret-value", AWS_SECRET_ACCESS_KEY: "another/secret+val" };
    await writeManagedSecrets(secrets);

    // the value must NOT appear in plaintext on disk
    const onDisk = readFileSync(file, "utf8");
    expect(onDisk).not.toContain("super-secret-value");
    expect(onDisk).not.toContain("another/secret+val");
    expect(JSON.parse(onDisk).alg).toBe("aes-256-gcm");

    expect(await readManagedSecrets()).toEqual(secrets);
  });

  it("a wrong key fails closed (throws) rather than returning empty", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", "key-one");
    await writeManagedSecrets({ CF_DNS_API_TOKEN: "x" });
    vi.stubEnv("MANAGED_SECRETS_KEY", "key-two");
    await expect(readManagedSecrets()).rejects.toThrow();
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

  it("round-trips an empty map", async () => {
    vi.stubEnv("MANAGED_SECRETS_KEY", "k");
    await writeManagedSecrets({});
    expect(await readManagedSecrets()).toEqual({});
  });
});
