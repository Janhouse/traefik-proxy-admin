import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDbModule } = await import("./helpers/test-db");
  return createTestDbModule();
});

import { eq } from "drizzle-orm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db, services } from "@/lib/db";
import { revokeApiToken } from "@/lib/harness/tokens";
import * as sharesRoute from "@/app/api/harness/v1/shares/route";
import * as shareRoute from "@/app/api/harness/v1/shares/[id]/route";
import * as meRoute from "@/app/api/harness/v1/me/route";
import * as mcpRoute from "@/app/api/harness/mcp/route";
import { truncateAll } from "./helpers/test-db";
import { inHours, makePrincipal, seedHarnessWorld } from "./helpers/harness-fixtures";

const BASE = "http://panel.test";
let world: Awaited<ReturnType<typeof seedHarnessWorld>>;

beforeEach(async () => {
  await truncateAll(db as unknown as { execute: (q: string) => Promise<unknown> });
  world = await seedHarnessWorld();
});

function req(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`${BASE}${path}`, { ...init, headers });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/* ── REST ──────────────────────────────────────────────────────────────────── */

describe("REST /api/harness/v1", () => {
  it("rejects missing, malformed and revoked tokens with 401", async () => {
    let res = await sharesRoute.GET(req("/api/harness/v1/shares"), undefined);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");

    res = await sharesRoute.GET(req("/api/harness/v1/shares", { token: "nope" }), undefined);
    expect(res.status).toBe(401);

    const { token, principal } = await makePrincipal();
    res = await sharesRoute.GET(req("/api/harness/v1/shares", { token }), undefined);
    expect(res.status).toBe(200);
    await revokeApiToken(principal.tokenId);
    res = await sharesRoute.GET(req("/api/harness/v1/shares", { token }), undefined);
    expect(res.status).toBe(401);
  });

  it("creates, lists, gets, extends and deletes a share", async () => {
    const { token } = await makePrincipal();
    const body = {
      hostname: "demo.e.example.com",
      targetUrl: "http://10.0.0.7:8080",
      authMode: "public",
      expiresAt: inHours(1),
      labels: { workspace: "ws-1", resource: "web", job: "j-1" },
    };
    let res = await sharesRoute.POST(
      req("/api/harness/v1/shares", { method: "POST", token, body: JSON.stringify(body) }),
      undefined
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.url).toBe("https://demo.e.example.com");

    res = await sharesRoute.GET(req("/api/harness/v1/shares?workspace=ws-1", { token }), undefined);
    expect((await res.json()).shares.map((s: { id: string }) => s.id)).toEqual([created.id]);

    res = await shareRoute.GET(req(`/api/harness/v1/shares/${created.id}`, { token }), ctx(created.id));
    expect((await res.json()).hostname).toBe("demo.e.example.com");

    const later = inHours(24);
    res = await shareRoute.PATCH(
      req(`/api/harness/v1/shares/${created.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ expiresAt: later }),
      }),
      ctx(created.id)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).expiresAt).toBe(new Date(later).toISOString());

    res = await shareRoute.DELETE(
      req(`/api/harness/v1/shares/${created.id}`, { method: "DELETE", token }),
      ctx(created.id)
    );
    expect(res.status).toBe(204);
    res = await shareRoute.GET(req(`/api/harness/v1/shares/${created.id}`, { token }), ctx(created.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 403) for admin-created entries and leaves them untouched", async () => {
    const { token } = await makePrincipal();
    const id = world.adminService.id;
    for (const res of [
      await shareRoute.GET(req(`/api/harness/v1/shares/${id}`, { token }), ctx(id)),
      await shareRoute.PATCH(
        req(`/api/harness/v1/shares/${id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ expiresAt: inHours(1) }),
        }),
        ctx(id)
      ),
      await shareRoute.DELETE(req(`/api/harness/v1/shares/${id}`, { method: "DELETE", token }), ctx(id)),
    ]) {
      expect(res.status).toBe(404);
    }
    const res = await sharesRoute.GET(req("/api/harness/v1/shares", { token }), undefined);
    expect((await res.json()).shares).toEqual([]);
    expect(await db.select().from(services).where(eq(services.id, id))).toHaveLength(1);
  });

  it("maps validation failures to 400 with issues, scope failures to 403", async () => {
    const { token } = await makePrincipal(["shares:read"]);
    let res = await sharesRoute.POST(
      req("/api/harness/v1/shares", { method: "POST", token, body: "{}" }),
      undefined
    );
    expect(res.status).toBe(403);

    const writer = await makePrincipal();
    res = await sharesRoute.POST(
      req("/api/harness/v1/shares", {
        method: "POST",
        token: writer.token,
        body: JSON.stringify({ hostname: "x.e.example.com", targetUrl: "http://a", authMode: "public" }),
      }),
      undefined
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/expiresAt/);

    res = await sharesRoute.POST(
      req("/api/harness/v1/shares", { method: "POST", token: writer.token, body: "{not json" }),
      undefined
    );
    expect(res.status).toBe(400);

    res = await sharesRoute.POST(
      req("/api/harness/v1/shares", {
        method: "POST",
        token: writer.token,
        body: JSON.stringify({ hostname: 5 }),
      }),
      undefined
    );
    expect(res.status).toBe(400);
    expect((await res.json()).issues.length).toBeGreaterThan(0);
  });

  it("GET /me describes the token and its zones", async () => {
    const { token } = await makePrincipal();
    const res = await meRoute.GET(req("/api/harness/v1/me", { token }), undefined);
    const me = await res.json();
    expect(me.token).toMatchObject({ ownerTag: "harness", scopes: ["shares:read", "shares:write"] });
    expect(me.zones.map((z: { suffix: string }) => z.suffix)).toEqual(["i.example.com", "e.example.com"]);
  });
});

/* ── MCP ───────────────────────────────────────────────────────────────────── */

async function mcpClient(token: string | null) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/harness/mcp`), {
    requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : undefined,
    fetch: async (input, init) => {
      const r = new Request(input, init);
      if (r.method === "POST") return mcpRoute.POST(r);
      if (r.method === "GET") return mcpRoute.GET();
      return mcpRoute.DELETE();
    },
  });
  await client.connect(transport);
  return client;
}

describe("MCP /api/harness/mcp", () => {
  it("requires a valid token", async () => {
    await expect(mcpClient(null)).rejects.toThrow();
    await expect(mcpClient("tpa_" + "x".repeat(43))).rejects.toThrow();
  });

  it("exposes annotated tools filtered by scope", async () => {
    const full = await mcpClient((await makePrincipal()).token);
    const { tools } = await full.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(
      ["create_share", "delete_share", "get_share", "list_shares", "update_share_expiry", "whoami"].sort()
    );
    expect(byName.list_shares.annotations?.readOnlyHint).toBe(true);
    expect(byName.delete_share.annotations?.destructiveHint).toBe(true);
    expect(byName.create_share.annotations?.destructiveHint).toBe(false);
    expect(byName.create_share.annotations?.openWorldHint).toBe(true);
    await full.close();

    const reader = await mcpClient((await makePrincipal(["shares:read"])).token);
    const names = (await reader.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_share", "list_shares", "whoami"]);
    await reader.close();
  });

  it("creates and deletes through tools, and cannot see admin entries", async () => {
    const client = await mcpClient((await makePrincipal()).token);
    const created = await client.callTool({
      name: "create_share",
      arguments: {
        hostname: "tool.i.example.com",
        targetUrl: "http://10.0.0.8:3000",
        authMode: "only-me",
        labels: { job: "j-2" },
      },
    });
    expect(created.isError).toBeFalsy();
    const share = created.structuredContent as { id: string; hostname: string };
    expect(share.hostname).toBe("tool.i.example.com");

    const listed = await client.callTool({ name: "list_shares", arguments: {} });
    const ids = (listed.structuredContent as { shares: Array<{ id: string }> }).shares.map((s) => s.id);
    expect(ids).toEqual([share.id]);

    const foreign = await client.callTool({
      name: "delete_share",
      arguments: { id: world.adminService.id },
    });
    expect(foreign.isError).toBe(true);
    expect(JSON.stringify(foreign.content)).toContain("not_found");
    expect(await db.select().from(services).where(eq(services.id, world.adminService.id))).toHaveLength(1);

    const publicNoExpiry = await client.callTool({
      name: "create_share",
      arguments: { hostname: "p.e.example.com", targetUrl: "http://a:1", authMode: "public" },
    });
    expect(publicNoExpiry.isError).toBe(true);

    const deleted = await client.callTool({ name: "delete_share", arguments: { id: share.id } });
    expect(deleted.isError).toBeFalsy();
    await client.close();
  });

  it("refuses cross-origin browser requests and GET streams", async () => {
    const { token } = await makePrincipal();
    const res = await mcpRoute.POST(
      new Request(`${BASE}/api/harness/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          origin: "https://evil.example",
          host: "panel.test",
          "content-type": "application/json",
        },
        body: "{}",
      })
    );
    expect(res.status).toBe(403);
    expect((await mcpRoute.GET()).status).toBe(405);
  });
});
