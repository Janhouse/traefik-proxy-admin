/* Pagination of Traefik list endpoints: every list route pages at per_page
 * and signals more via X-Next-Page; traefikFetchAll must follow it for all of
 * them (not just certificates) and stop safely. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCertificates,
  getHttpRouters,
  traefikFetchAll,
} from "@/lib/traefik-api";

type Page = { body: unknown; next?: string; status?: number };

const calls: string[] = [];

function mockFetchPages(pages: Record<string, Page>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const page = new URL(url).searchParams.get("page") || "1";
      const p = pages[page] ?? { body: [], status: 404 };
      const headers = new Headers();
      if (p.next !== undefined) headers.set("X-Next-Page", p.next);
      return {
        ok: (p.status ?? 200) < 400,
        status: p.status ?? 200,
        headers,
        json: async () => p.body,
      } as unknown as Response;
    })
  );
}

beforeEach(() => {
  calls.length = 0;
  process.env.TRAEFIK_API_URL = "http://traefik:8080/";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TRAEFIK_API_URL;
});

describe("traefikFetchAll", () => {
  it("follows X-Next-Page across two pages and concatenates", async () => {
    mockFetchPages({
      "1": { body: [{ name: "a" }, { name: "b" }], next: "2" },
      "2": { body: [{ name: "c" }], next: "2" }, // equal to current → stop
    });
    const out = await traefikFetchAll<{ name: string }>("/api/http/routers");
    expect(out.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(calls).toEqual([
      "http://traefik:8080/api/http/routers?page=1&per_page=500",
      "http://traefik:8080/api/http/routers?page=2&per_page=500",
    ]);
  });

  it("stops on a missing header and on X-Next-Page: 1", async () => {
    mockFetchPages({ "1": { body: [{ name: "only" }] } });
    expect(await traefikFetchAll("/api/entrypoints")).toHaveLength(1);
    expect(calls).toHaveLength(1);

    calls.length = 0;
    mockFetchPages({ "1": { body: [{ name: "only" }], next: "1" } });
    expect(await traefikFetchAll("/api/entrypoints")).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("caps runaway pagination at the hard page limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const page = Number(new URL(url).searchParams.get("page"));
        const headers = new Headers({ "X-Next-Page": String(page + 1) });
        return {
          ok: true,
          status: 200,
          headers,
          json: async () => [{ page }],
        } as unknown as Response;
      })
    );
    const out = await traefikFetchAll("/api/http/services");
    expect(calls).toHaveLength(50);
    expect(out).toHaveLength(50);
  });

  it("surfaces the HTTP status on a non-2xx response", async () => {
    mockFetchPages({ "1": { body: null, status: 404 } });
    await expect(getCertificates()).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("/api/certificates"),
    });
  });

  it("is used by the plain list wrappers too", async () => {
    mockFetchPages({
      "1": { body: [{ name: "r1@file" }], next: "2" },
      "2": { body: [{ name: "r2@file" }] },
    });
    const routers = await getHttpRouters();
    expect(routers.map((r) => r.name)).toEqual(["r1@file", "r2@file"]);
  });
});
