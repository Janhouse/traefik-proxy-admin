import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { hashText, isManagedMode, serializeSecretsEnv } from "@/lib/managed-traefik";
import { dirname, join } from "node:path";

/* ─────────────────────────────────────────────────────────────────────────
 * Managed DNS-provider credential VALUES are persisted to a file, NOT to the
 * application database. The database only records the credential names (see
 * getManagedSecretMeta in app-config). The file is AES-256-GCM encrypted with
 * a key derived from MANAGED_SECRETS_KEY, so it can't be read at rest without
 * the key. There is NO HTTP endpoint for the values: the panel decrypts them
 * in-process and materialises them into a shell-sourceable env file on a tmpfs
 * mount shared read-only with the Traefik container (see below).
 *
 * File format (v2): {"v":2,"alg":"aes-256-gcm","iv","tag","data"} where the
 * envelope header {v, alg} is bound as GCM additional authenticated data, so
 * neither field can be swapped without failing the tag. v1 files (written
 * without AAD by pre-release builds) are NOT readable — they surface as
 * "undecryptable" and must be reset/re-entered.
 *
 * If MANAGED_SECRETS_KEY is unset (e.g. dev), values are written unencrypted
 * with a warning — still out of the database, but readable on disk. Once a
 * key IS configured, a plaintext file is refused (no silent downgrade).
 * ───────────────────────────────────────────────────────────────────────── */

const ALG = "aes-256-gcm";
const FORMAT_VERSION = 2;
/** MANAGED_SECRETS_KEY is hashed to 32 bytes, but a short passphrase makes
 * that hash guessable — insist on real entropy (openssl rand -hex 32). */
const MIN_KEY_CHARS = 32;

/** Thrown when the credential file exists but can't be read with the current
 * key/format. Callers treat it as "values lost; offer a reset". */
export class SecretsUndecryptableError extends Error {
  readonly undecryptable = true as const;
  constructor(message: string) {
    super(message);
    this.name = "SecretsUndecryptableError";
  }
}

export function isSecretsUndecryptableError(
  error: unknown
): error is SecretsUndecryptableError {
  return (
    error instanceof SecretsUndecryptableError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { undecryptable?: unknown }).undecryptable === true)
  );
}

/* ── Materialised env for the Traefik wrapper ─────────────────────────────
 * Traefik (lego) needs the DNS-provider credentials as environment variables
 * in ITS container. There is deliberately NO HTTP endpoint for that: the panel
 * decrypts the store and writes a shell-sourceable env file into a directory
 * that the compose bundle backs with a tmpfs volume shared with the Traefik
 * service (mounted read-only there). Plaintext therefore only ever exists in
 * RAM — never on a persistent volume, never on the network — and after a host
 * reboot the panel simply rewrites it at startup. */
const DEFAULT_ENV_FILE = "/managed-secrets/traefik.env";

export function envFilePath(): string {
  return process.env.MANAGED_SECRETS_ENV_FILE?.trim() || DEFAULT_ENV_FILE;
}

export interface SecretsEnvStatus {
  path: string;
  /** The env file exists on the shared mount. */
  materialized: boolean;
  writtenAt: string | null;
  /** hashText() of the file contents, for comparing with the stored meta hash. */
  hash: string | null;
}

/** Non-throwing: what is currently on the shared mount. */
export async function secretsEnvStatus(): Promise<SecretsEnvStatus> {
  const path = envFilePath();
  try {
    const [st, body] = await Promise.all([stat(path), readFile(path, "utf8")]);
    return { path, materialized: true, writtenAt: st.mtime.toISOString(), hash: hashText(body) };
  } catch {
    return { path, materialized: false, writtenAt: null, hash: null };
  }
}

async function materializeUnlocked(values: Record<string, string>): Promise<void> {
  await writeFileAtomic(envFilePath(), serializeSecretsEnv(values));
}

/**
 * (Re)write the env file from the encrypted store. Called at startup (the
 * tmpfs is empty after a reboot) and after every credential write. Throws
 * SecretsUndecryptableError / key errors like readManagedSecrets — the caller
 * decides how loudly to report; an existing env file is left untouched then.
 */
export async function materializeManagedSecrets(): Promise<SecretsEnvStatus> {
  return withSecretsLock(async () => {
    const values = await readManagedSecrets();
    await materializeUnlocked(values);
    return secretsEnvStatus();
  });
}

function filePath(): string {
  return (
    process.env.MANAGED_SECRETS_FILE?.trim() ||
    join(process.cwd(), ".managed-secrets.enc")
  );
}

/**
 * 32-byte key derived from MANAGED_SECRETS_KEY, or null when unset. Throws
 * loudly on a weak key so a misconfiguration surfaces at first use rather
 * than as silently weak encryption.
 */
function keyMaterial(): Buffer | null {
  const raw = process.env.MANAGED_SECRETS_KEY?.trim();
  if (!raw) return null;
  if (raw.length < MIN_KEY_CHARS) {
    throw new Error(
      `MANAGED_SECRETS_KEY is too short (${raw.length} chars) — it must be at least ${MIN_KEY_CHARS} characters. Generate one with: openssl rand -hex 32`
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function isSecretsEncryptionEnabled(): boolean {
  return keyMaterial() !== null;
}

interface Envelope {
  v: number;
  alg: "aes-256-gcm" | "plain";
  iv?: string;
  tag?: string;
  data: string; // base64 ciphertext (aes) or the raw JSON string (plain)
}

/** The authenticated header: exactly the fields a reader trusts before
 * decrypting. Stable serialisation — key order matters for AAD. */
function aad(env: Pick<Envelope, "v" | "alg">): Buffer {
  return Buffer.from(JSON.stringify({ v: env.v, alg: env.alg }), "utf8");
}

function encryptEnvelope(json: string, key: Buffer): Envelope {
  const header = { v: FORMAT_VERSION, alg: "aes-256-gcm" as const };
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(aad(header));
  const data = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  return {
    ...header,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function decryptEnvelope(env: Envelope, key: Buffer): string {
  const decipher = createDecipheriv(ALG, key, Buffer.from(env.iv ?? "", "base64"));
  decipher.setAAD(aad(env));
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
 * Throws SecretsUndecryptableError on a decrypt/parse failure (wrong or
 * rotated key, unsupported format, corrupt file) rather than returning {} —
 * so the wrapper keeps its previous env instead of silently wiping live
 * credentials, and the UI can offer a reset.
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

  const key = keyMaterial();
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    throw new SecretsUndecryptableError("credential file is not valid JSON");
  }
  if (!env || typeof env !== "object" || typeof env.data !== "string") {
    throw new SecretsUndecryptableError("credential file has an unknown layout");
  }

  if (env.alg === "plain") {
    if (key) {
      // A plaintext file under a configured key is either a leftover from a
      // key-less run or tampering — never accept it as authoritative.
      throw new SecretsUndecryptableError(
        "credential file is unencrypted but MANAGED_SECRETS_KEY is set — reset the credentials to re-encrypt them"
      );
    }
    try {
      return sanitize(JSON.parse(env.data));
    } catch {
      throw new SecretsUndecryptableError("plaintext credential file is corrupt");
    }
  }

  if (!key) {
    throw new Error(
      "MANAGED_SECRETS_KEY is required to read the encrypted credential file"
    );
  }
  if (env.alg !== "aes-256-gcm" || env.v !== FORMAT_VERSION) {
    throw new SecretsUndecryptableError(
      `credential file format v${env.v}/${env.alg} is not supported — reset the credentials and re-enter them`
    );
  }
  try {
    return sanitize(JSON.parse(decryptEnvelope(env, key)));
  } catch {
    throw new SecretsUndecryptableError(
      "credential file cannot be decrypted with the current MANAGED_SECRETS_KEY (rotated key or corrupt file)"
    );
  }
}

/** Non-throwing probe for status endpoints: can the file be read right now? */
export async function probeManagedSecrets(): Promise<{ undecryptable: boolean }> {
  try {
    await readManagedSecrets();
    return { undecryptable: false };
  } catch (error) {
    if (isSecretsUndecryptableError(error)) return { undecryptable: true };
    throw error;
  }
}

/* ── Serialised writes ────────────────────────────────────────────────────── */

/** Module-level promise mutex: read-modify-write sequences never interleave
 * within this process (concurrent PUTs would otherwise lose edits). */
let chain: Promise<unknown> = Promise.resolve();

export function withSecretsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // Keep the chain alive regardless of the outcome of `run`.
  chain = run.catch(() => undefined);
  return run;
}

/** Atomic, durable file replace: unique temp name (concurrent writers never
 * share one), fsync before rename, 0600 from creation. */
async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const fh = await open(tmp, "w", 0o600);
    try {
      await fh.writeFile(contents, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

/** Encrypt (or, without a key, plainly store) credentials to the file. Takes
 * the write lock itself; use `updateManagedSecrets` for read-modify-write. */
export async function writeManagedSecrets(
  values: Record<string, string>
): Promise<void> {
  await withSecretsLock(() => writeUnlocked(values));
}

async function writeUnlocked(values: Record<string, string>): Promise<void> {
  const json = JSON.stringify(values);
  const key = keyMaterial();
  let env: Envelope;
  if (key) {
    env = encryptEnvelope(json, key);
  } else {
    console.warn(
      "MANAGED_SECRETS_KEY is not set — storing DNS credentials UNENCRYPTED at rest"
    );
    env = { v: FORMAT_VERSION, alg: "plain", data: json };
  }
  await writeFileAtomic(filePath(), JSON.stringify(env));
  // The env file is consumed only by the bundled wrapper, i.e. managed mode.
  // Outside it there is no shared mount, so materialising would just try to
  // mkdir the default path at the filesystem root and fail on every write —
  // skip it. The store itself still works everywhere.
  if (!isManagedMode()) return;
  // The store is the source of truth; the env file is derived from it. A
  // failed materialisation is logged and surfaced via secretsEnvStatus()
  // (the managed status shows it as stale) rather than failing the save.
  try {
    await materializeUnlocked(values);
  } catch (error) {
    console.error(
      "Stored credentials but could not write the Traefik env file:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}

/**
 * Read-modify-write under the lock. `mutate` receives the current values —
 * or `null` when the file is undecryptable, so the caller can decide whether
 * to start over (reset) or decline by returning null.
 * Returns the persisted map, or null when `mutate` declined to write.
 */
export async function updateManagedSecrets(
  mutate: (
    current: Record<string, string> | null
  ) => Promise<Record<string, string> | null> | Record<string, string> | null
): Promise<Record<string, string> | null> {
  return withSecretsLock(async () => {
    let current: Record<string, string> | null;
    try {
      current = await readManagedSecrets();
    } catch (error) {
      if (!isSecretsUndecryptableError(error)) throw error;
      current = null;
    }
    const next = await mutate(current);
    if (next === null) return null;
    await writeUnlocked(next);
    return next;
  });
}
