import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/* ─────────────────────────────────────────────────────────────────────────
 * Managed DNS-provider credential VALUES are persisted to a file, NOT to the
 * application database. The database only records the credential names (see
 * getManagedSecretMeta in app-config). The file is AES-256-GCM encrypted with
 * a key derived from MANAGED_SECRETS_KEY, so it can't be read at rest without
 * the key. The only reader is the in-network wrapper, via the one-way
 * /api/traefik/managed/secrets-env endpoint.
 *
 * If MANAGED_SECRETS_KEY is unset (e.g. dev), values are written unencrypted
 * with a warning — still out of the database, but readable on disk.
 * ───────────────────────────────────────────────────────────────────────── */

const ALG = "aes-256-gcm";

function filePath(): string {
  return (
    process.env.MANAGED_SECRETS_FILE?.trim() ||
    join(process.cwd(), ".managed-secrets.enc")
  );
}

/** 32-byte key derived from MANAGED_SECRETS_KEY, or null when unset. */
function keyMaterial(): Buffer | null {
  const raw = process.env.MANAGED_SECRETS_KEY?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function isSecretsEncryptionEnabled(): boolean {
  return keyMaterial() !== null;
}

interface Envelope {
  v: 1;
  alg: "aes-256-gcm" | "plain";
  iv?: string;
  tag?: string;
  data: string; // base64 ciphertext (aes) or the raw JSON string (plain)
}

function encryptEnvelope(json: string, key: Buffer): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const data = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function decryptEnvelope(env: Envelope, key: Buffer): string {
  const decipher = createDecipheriv(ALG, key, Buffer.from(env.iv ?? "", "base64"));
  decipher.setAuthTag(Buffer.from(env.tag ?? "", "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(env.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function sanitize(parsed: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (parsed && typeof parsed === "object") {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/**
 * Read and decrypt stored credentials. Returns {} when no file exists.
 * Throws on a decrypt/parse failure (wrong key or corrupt file) rather than
 * returning {} — so the wrapper keeps its previous env instead of silently
 * wiping live credentials.
 */
export async function readManagedSecrets(): Promise<Record<string, string>> {
  let raw: string;
  try {
    raw = await readFile(filePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw error;
  }
  if (!raw.trim()) return {};
  const env = JSON.parse(raw) as Envelope;
  if (env.alg === "plain") return sanitize(JSON.parse(env.data));
  const key = keyMaterial();
  if (!key) {
    throw new Error(
      "MANAGED_SECRETS_KEY is required to read the encrypted credential file"
    );
  }
  return sanitize(JSON.parse(decryptEnvelope(env, key)));
}

/** Encrypt (or, without a key, plainly store) credentials to the file, 0600,
 * written atomically via a temp file + rename. */
export async function writeManagedSecrets(
  values: Record<string, string>
): Promise<void> {
  const json = JSON.stringify(values);
  const key = keyMaterial();
  let env: Envelope;
  if (key) {
    env = encryptEnvelope(json, key);
  } else {
    console.warn(
      "MANAGED_SECRETS_KEY is not set — storing DNS credentials UNENCRYPTED at rest"
    );
    env = { v: 1, alg: "plain", data: json };
  }
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(env), { mode: 0o600 });
  await rename(tmp, path);
}
