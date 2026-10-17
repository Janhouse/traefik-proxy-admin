import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { apiTokens, db, type ApiToken } from "@/lib/db";
import {
  API_TOKEN_SCOPES,
  DEFAULT_OWNER_TAG,
  OWNER_TAG_RE,
  type ApiTokenScope,
} from "./constants";

/** Plaintext format: "tpa_" + 32 random bytes as base64url (43 chars). */
const TOKEN_PREFIX = "tpa_";
const TOKEN_RE = /^tpa_[A-Za-z0-9_-]{43}$/;
/** last_used_at is refreshed at most this often per token. */
const LAST_USED_RESOLUTION_MS = 60_000;

/** Who is calling: what the share layer authorizes against. */
export interface TokenPrincipal {
  tokenId: string;
  name: string;
  ownerTag: string;
  scopes: ApiTokenScope[];
}

/** A token as the admin UI sees it — never the hash. */
interface ApiTokenView {
  id: string;
  name: string;
  tokenPrefix: string;
  ownerTag: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const createTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    ownerTag: z
      .string()
      .trim()
      .toLowerCase()
      .regex(OWNER_TAG_RE, "owner tag: lowercase letters, digits, . _ -")
      .default(DEFAULT_OWNER_TAG),
    scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
  })
  .strict();

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function toView(row: ApiToken): ApiTokenView {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    ownerTag: row.ownerTag,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Create a token. The plaintext is returned exactly once — only its SHA-256
 * is stored (tokens are 256-bit random, so a fast hash is sufficient).
 */
export async function createApiToken(
  input: unknown
): Promise<{ token: string; record: ApiTokenView }> {
  const data = createTokenSchema.parse(input);
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiTokens)
    .values({
      name: data.name,
      ownerTag: data.ownerTag,
      scopes: [...new Set(data.scopes)],
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 12),
    })
    .returning();
  return { token, record: toView(row) };
}

export async function listApiTokens(): Promise<ApiTokenView[]> {
  const rows = await db.select().from(apiTokens).orderBy(desc(apiTokens.createdAt));
  return rows.map(toView);
}

/** Revoke (idempotent). Returns false when no such token exists. */
export async function revokeApiToken(id: string): Promise<boolean> {
  if (!z.guid().safeParse(id).success) return false;
  const existing = await db.select().from(apiTokens).where(eq(apiTokens.id, id));
  if (existing.length === 0) return false;
  if (!existing[0].revokedAt) {
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)));
  }
  return true;
}

/** Extract the bearer token from an Authorization header value. */
export function bearerFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/**
 * Resolve a plaintext token to its principal, or null when it is malformed,
 * unknown or revoked. Refreshes last_used_at (coarsely).
 */
export async function authenticateToken(
  token: string | null | undefined
): Promise<TokenPrincipal | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  const row = rows[0];
  if (!row) return null;

  const now = new Date();
  await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(apiTokens.id, row.id),
        or(
          isNull(apiTokens.lastUsedAt),
          lt(apiTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_RESOLUTION_MS))
        )
      )
    );

  return {
    tokenId: row.id,
    name: row.name,
    ownerTag: row.ownerTag,
    scopes: row.scopes.filter((s): s is ApiTokenScope =>
      (API_TOKEN_SCOPES as readonly string[]).includes(s)
    ),
  };
}
