import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDbModule } = await import("./helpers/test-db");
  return createTestDbModule();
});
// The generator asks Traefik's API for entrypoint TLS info; there is none here.
vi.mock("@/lib/traefik-api", () => ({
  getEntrypoints: vi.fn(async () => []),
  getHttpRouters: vi.fn(async () => []),
  isTraefikApiConfigured: vi.fn(() => false),
  providerOf: vi.fn(() => "http"),
}));

import { eq } from "drizzle-orm";
import { db, services, apiTokens } from "@/lib/db";
import {
  createShare,
  deleteShare,
  getShare,
  HarnessError,
  listShares,
  updateShareExpiry,
} from "@/lib/harness/shares";
import { sweepExpiredShares } from "@/lib/harness/sweeper";
import {
  authenticateToken,
  bearerFromHeader,
  listApiTokens,
  revokeApiToken,
} from "@/lib/harness/tokens";
import { generateTraefikConfig } from "@/lib/traefik-config";
import { truncateAll } from "./helpers/test-db";
import { inHours, makePrincipal, seedHarnessWorld } from "./helpers/harness-fixtures";

type World = Awaited<ReturnType<typeof seedHarnessWorld>>;
let world: World;

beforeEach(async () => {
  await truncateAll(db as unknown as { execute: (q: string) => Promise<unknown> });
  world = await seedHarnessWorld();
});

async function expectHarnessError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(HarnessError);
  expect((err as HarnessError).code).toBe(code);
  return err as HarnessError;
}

const network = (hostname = "app.i.example.com") => ({
  hostname,
  targetUrl: "http://workspace-1.harness.svc:8080",
  authMode: "network" as const,
  labels: { workspace: "ws-1", job: "job-9" },
});

/* ── Invariant: a token only ever sees/touches its owner's entries ─────────── */

describe("ownership isolation", () => {
  it("never lists, reads, changes or deletes an admin-created service", async () => {
    const { principal } = await makePrincipal();
    const id = world.adminService.id;

    expect(await listShares(principal)).toEqual([]);
    await expectHarnessError(getShare(principal, id), "not_found");
    await expectHarnessError(
      updateShareExpiry(principal, id, { expiresAt: inHours(1) }),
      "not_found"
    );
    await expectHarnessError(deleteShare(principal, id), "not_found");

    const [still] = await db.select().from(services).where(eq(services.id, id));
    expect(still).toBeDefined();
    expect(still.expiresAt).toBeNull();
  });

  it("isolates owner tags from each other, but shares across tokens of one tag", async () => {
    const a = await makePrincipal(undefined, "harness", "a");
    const rotated = await makePrincipal(undefined, "harness", "a2");
    const other = await makePrincipal(undefined, "other-tool", "b");

    const share = await createShare(a.principal, network());

    expect(await listShares(other.principal)).toEqual([]);
    await expectHarnessError(getShare(other.principal, share.id), "not_found");
    await expectHarnessError(deleteShare(other.principal, share.id), "not_found");

    expect((await listShares(rotated.principal)).map((s) => s.id)).toEqual([share.id]);
    await deleteShare(rotated.principal, share.id);
    expect(await listShares(a.principal)).toEqual([]);
  });

  it("does not reveal anything about an admin service holding a hostname", async () => {
    const { principal } = await makePrincipal();
    const err = await expectHarnessError(
      createShare(principal, {
        hostname: "admin-app.e.example.com",
        targetUrl: "http://x:1",
        authMode: "public",
        expiresAt: inHours(1),
      }),
      "conflict"
    );
    expect(err.message).toBe("hostname is already in use");
  });

  it("treats malformed ids as not found", async () => {
    const { principal } = await makePrincipal();
    await expectHarnessError(getShare(principal, "'; DROP TABLE services; --"), "not_found");
  });
});

/* ── Create / validation ───────────────────────────────────────────────────── */

describe("createShare", () => {
  it("creates a network share on the intranet zone and returns the view", async () => {
    const { principal } = await makePrincipal();
    const share = await createShare(principal, network("App.I.Example.com."));
    expect(share).toMatchObject({
      hostname: "app.i.example.com",
      url: "https://app.i.example.com",
      targetUrl: "http://workspace-1.harness.svc:8080",
      authMode: "network",
      expiresAt: null,
      labels: { workspace: "ws-1", job: "job-9" },
    });
    const [row] = await db.select().from(services).where(eq(services.id, share.id));
    expect(row.ownerTag).toBe("harness");
    expect(row.createdByTokenId).toBe(principal.tokenId);
    expect(row.subdomain).toBe("app");
    expect(row.domainId).toBe(world.intra.id);
    expect(JSON.parse(row.entrypoints!)).toEqual(["websecure"]);
    expect(row.middlewares).toBeNull();
  });

  it("only-me adds the configured forward-auth middleware", async () => {
    const { principal } = await makePrincipal();
    const share = await createShare(principal, { ...network(), authMode: "only-me" });
    const [row] = await db.select().from(services).where(eq(services.id, share.id));
    expect(JSON.parse(row.middlewares!)).toEqual(["auth-authentik@file"]);
  });

  it("public requires an expiry in the future", async () => {
    const { principal } = await makePrincipal();
    const base = {
      hostname: "pub.e.example.com",
      targetUrl: "https://10.1.2.3",
      authMode: "public" as const,
    };
    await expectHarnessError(createShare(principal, base), "invalid_request");
    await expectHarnessError(
      createShare(principal, { ...base, expiresAt: null }),
      "invalid_request"
    );
    await expectHarnessError(
      createShare(principal, { ...base, expiresAt: inHours(-1) }),
      "invalid_request"
    );
    const share = await createShare(principal, { ...base, expiresAt: inHours(2) });
    expect(share.authMode).toBe("public");
    expect(share.targetUrl).toBe("https://10.1.2.3:443");
    const [row] = await db.select().from(services).where(eq(services.id, share.id));
    expect(JSON.parse(row.middlewares!)).toEqual(["hsts@file"]);
  });

  it("rejects hostnames outside the allowed suffixes", async () => {
    const { principal } = await makePrincipal(["shares:read", "shares:write", "customHostname"]);
    for (const hostname of [
      "app.example.com",
      "i.example.com", // the suffix itself
      "app.i.example.com.evil.net",
      "appi.example.com",
      "git.janhouse.lv",
    ]) {
      await expectHarnessError(createShare(principal, network(hostname)), "invalid_request");
    }
  });

  it("requires the customHostname scope for multi-label hostnames", async () => {
    const plain = await makePrincipal();
    await expectHarnessError(
      createShare(plain.principal, network("a.b.i.example.com")),
      "forbidden"
    );
    const custom = await makePrincipal(["shares:read", "shares:write", "customHostname"]);
    const share = await createShare(custom.principal, network("a.b.i.example.com"));
    const [row] = await db.select().from(services).where(eq(services.id, share.id));
    expect(row.hostnameMode).toBe("custom");
    expect(JSON.parse(row.customHostnames!)).toEqual(["a.b.i.example.com"]);
  });

  it("enforces each zone's allowed auth modes", async () => {
    const { principal } = await makePrincipal();
    await expectHarnessError(
      createShare(principal, { ...network(), authMode: "public", expiresAt: inHours(1) }),
      "invalid_request"
    );
    await expectHarnessError(
      createShare(principal, { ...network("x.e.example.com"), authMode: "network" }),
      "invalid_request"
    );
  });

  it("validates the target URL and unknown fields", async () => {
    const { principal } = await makePrincipal();
    for (const targetUrl of [
      "ftp://x",
      "http://user:pw@x",
      "http://x/path",
      "http://x/?q=1",
      "not a url",
    ]) {
      await expectHarnessError(
        createShare(principal, { ...network(), targetUrl }),
        "invalid_request"
      );
    }
    await expectHarnessError(
      createShare(principal, { ...network(), middlewares: ["evil@file"] }),
      "invalid_request"
    );
  });

  it("rejects duplicate hostnames", async () => {
    const { principal } = await makePrincipal();
    await createShare(principal, network());
    await expectHarnessError(createShare(principal, network()), "conflict");
  });

  it("reports a zone whose domain is missing from the panel", async () => {
    const { principal } = await makePrincipal();
    await db.delete(services);
    await db.execute("DELETE FROM domains WHERE domain = 'i.example.com'");
    await expectHarnessError(createShare(principal, network()), "not_configured");
  });
});

/* ── Scopes ────────────────────────────────────────────────────────────────── */

describe("scopes", () => {
  it("read-only tokens cannot create, change or delete", async () => {
    const writer = await makePrincipal();
    const reader = await makePrincipal(["shares:read"]);
    const share = await createShare(writer.principal, network());

    expect((await listShares(reader.principal)).length).toBe(1);
    await expectHarnessError(createShare(reader.principal, network("b.i.example.com")), "forbidden");
    await expectHarnessError(
      updateShareExpiry(reader.principal, share.id, { expiresAt: inHours(1) }),
      "forbidden"
    );
    await expectHarnessError(deleteShare(reader.principal, share.id), "forbidden");
  });

  it("write-only tokens cannot list", async () => {
    const writer = await makePrincipal(["shares:write"]);
    await expectHarnessError(listShares(writer.principal), "forbidden");
  });
});

/* ── Expiry update / list filter ───────────────────────────────────────────── */

describe("updateShareExpiry / listShares", () => {
  it("extends and shortens; public cannot drop its expiry", async () => {
    const { principal } = await makePrincipal();
    const pub = await createShare(principal, {
      hostname: "pub.e.example.com",
      targetUrl: "http://10.0.0.1:3000",
      authMode: "public",
      expiresAt: inHours(1),
    });
    const later = inHours(48);
    expect((await updateShareExpiry(principal, pub.id, { expiresAt: later })).expiresAt).toBe(
      new Date(later).toISOString()
    );
    const sooner = inHours(0.5);
    expect((await updateShareExpiry(principal, pub.id, { expiresAt: sooner })).expiresAt).toBe(
      new Date(sooner).toISOString()
    );
    await expectHarnessError(
      updateShareExpiry(principal, pub.id, { expiresAt: null }),
      "invalid_request"
    );

    const net = await createShare(principal, { ...network(), expiresAt: inHours(1) });
    expect((await updateShareExpiry(principal, net.id, { expiresAt: null })).expiresAt).toBeNull();
  });

  it("filters by labels", async () => {
    const { principal } = await makePrincipal();
    await createShare(principal, network("a.i.example.com"));
    await createShare(principal, {
      ...network("b.i.example.com"),
      labels: { workspace: "ws-2", resource: "web" },
    });
    expect((await listShares(principal, { workspace: "ws-2" })).map((s) => s.hostname)).toEqual([
      "b.i.example.com",
    ]);
    expect((await listShares(principal, { job: "job-9" })).map((s) => s.hostname)).toEqual([
      "a.i.example.com",
    ]);
    expect(await listShares(principal, { workspace: "nope" })).toEqual([]);
  });
});

/* ── Sweeper ───────────────────────────────────────────────────────────────── */

describe("sweepExpiredShares", () => {
  it("deletes expired API-created entries only", async () => {
    const { principal } = await makePrincipal();
    const now = new Date();
    const soon = await createShare(principal, { ...network("soon.i.example.com"), expiresAt: inHours(1, now) });
    const later = await createShare(principal, { ...network("later.i.example.com"), expiresAt: inHours(5, now) });
    const forever = await createShare(principal, network("forever.i.example.com"));
    // An admin service with an expiresAt is never deleted by the sweeper.
    await db
      .update(services)
      .set({ expiresAt: new Date(now.getTime() - 1000) })
      .where(eq(services.id, world.adminService.id));

    const removed = await sweepExpiredShares(new Date(now.getTime() + 2 * 3600_000));
    expect(removed).toEqual(["soon.i.example.com"]);

    const ids = (await listShares(principal)).map((s) => s.id);
    expect(ids).toEqual([later.id, forever.id]);
    expect(ids).not.toContain(soon.id);
    const [admin] = await db.select().from(services).where(eq(services.id, world.adminService.id));
    expect(admin).toBeDefined();
  });
});

/* ── Tokens ────────────────────────────────────────────────────────────────── */

describe("tokens", () => {
  it("stores only a hash, authenticates, and stops working once revoked", async () => {
    const { token, principal } = await makePrincipal();
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, principal.tokenId));
    expect(row.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.lastUsedAt).not.toBeNull();
    expect(token.startsWith(row.tokenPrefix)).toBe(true);

    expect(await revokeApiToken(principal.tokenId)).toBe(true);
    expect(await authenticateToken(token)).toBeNull();
    expect((await listApiTokens())[0].revokedAt).not.toBeNull();
    // idempotent; unknown ids are reported
    expect(await revokeApiToken(principal.tokenId)).toBe(true);
    expect(await revokeApiToken("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("rejects malformed or unknown tokens", async () => {
    expect(await authenticateToken(null)).toBeNull();
    expect(await authenticateToken("tpa_short")).toBeNull();
    expect(await authenticateToken("tpa_" + "A".repeat(43))).toBeNull();
    expect(bearerFromHeader("Bearer abc")).toBe("abc");
    expect(bearerFromHeader("bearer   abc ")).toBe("abc");
    expect(bearerFromHeader("Basic abc")).toBeNull();
  });

  it("revoking a token keeps its shares under the owner tag", async () => {
    const a = await makePrincipal();
    const share = await createShare(a.principal, network());
    await revokeApiToken(a.principal.tokenId);
    const b = await makePrincipal();
    expect((await getShare(b.principal, share.id)).id).toBe(share.id);
  });
});

/* ── End to end with the generator ─────────────────────────────────────────── */

describe("generated Traefik config", () => {
  it("routes intranet shares only on their edge, and stops routing them at expiry", async () => {
    const { principal } = await makePrincipal();
    const now = new Date();
    await createShare(principal, { ...network(), authMode: "only-me", expiresAt: inHours(1, now) });

    const publicCfg = await generateTraefikConfig({ now });
    expect(JSON.stringify(publicCfg)).not.toContain("app.i.example.com");

    const internal = await generateTraefikConfig({ edge: "internal", now });
    const router = internal.http.routers["router-app"];
    expect(router.rule).toBe("Host(`app.i.example.com`)");
    expect(router.middlewares).toEqual(["auth-authentik@file"]);
    expect(router.entryPoints).toEqual(["websecure"]);
    expect(router.tls?.certResolver).toBe("le");

    const afterExpiry = await generateTraefikConfig({
      edge: "internal",
      now: new Date(now.getTime() + 2 * 3600_000),
    });
    expect(afterExpiry.http.routers["router-app"]).toBeUndefined();
  });
});
