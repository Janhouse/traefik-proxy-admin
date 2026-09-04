import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEntrypoints: vi.fn(),
}));

vi.mock("@/lib/traefik-api", () => ({
  getEntrypoints: mocks.getEntrypoints,
}));

import {
  __resetEntrypointTlsCacheForTests,
  entrypointTlsFromApi,
  isTlsEntrypoint,
  resolveEntrypointTlsInfo,
  type EntrypointTlsInfo,
} from "@/lib/entrypoint-tls";

describe("entrypointTlsFromApi", () => {
  it("is decisive only on default TLS or a well-known port", () => {
    expect(entrypointTlsFromApi({ hasDefaultTls: true })).toBe(true);
    expect(entrypointTlsFromApi({ address: ":443" })).toBe(true);
    expect(entrypointTlsFromApi({ address: ":8443" })).toBe(true);
    expect(entrypointTlsFromApi({ address: ":80" })).toBe(false);
    expect(entrypointTlsFromApi({ address: "0.0.0.0:8080/tcp" })).toBe(false);
    // no info at all, or an unknown port: no verdict (the caller decides)
    expect(entrypointTlsFromApi(undefined)).toBeNull();
    expect(entrypointTlsFromApi({})).toBeNull();
    expect(entrypointTlsFromApi({ address: ":9000" })).toBeNull();
    expect(entrypointTlsFromApi({ address: "garbage" })).toBeNull();
  });
});

describe("isTlsEntrypoint", () => {
  const cases: Array<{
    name: string;
    info?: EntrypointTlsInfo;
    expected: boolean;
    why: string;
  }> = [
    // 1. hasDefaultTls is authoritative
    { name: "web", info: { hasDefaultTls: true }, expected: true, why: "default TLS wins over plain-sounding name" },
    { name: "anything", info: { address: ":80", hasDefaultTls: true }, expected: true, why: "default TLS wins over plain port" },
    // 2. port from address
    { name: "custom", info: { address: ":443" }, expected: true, why: "port 443" },
    { name: "custom", info: { address: "0.0.0.0:443" }, expected: true, why: "host:443" },
    { name: "custom", info: { address: ":8443" }, expected: true, why: "port 8443" },
    { name: "custom", info: { address: ":80/tcp" }, expected: false, why: "port 80 with /tcp suffix" },
    { name: "custom", info: { address: ":80" }, expected: false, why: "port 80" },
    { name: "custom", info: { address: ":8080" }, expected: false, why: "port 8080" },
    { name: "websecure", info: { address: ":9999" }, expected: true, why: "unknown port falls through to name" },
    // 3. TLS-ish names (must beat the "web"/"http" check)
    { name: "websecure", expected: true, why: "contains 'secure' before 'web'" },
    { name: "https", expected: true, why: "contains 'https' before 'http'" },
    { name: "ssl-edge", expected: true, why: "contains 'ssl'" },
    { name: "web-tls", expected: true, why: "contains 'tls' before 'web'" },
    { name: "http-tls", expected: true, why: "contains 'tls' before 'http'" },
    { name: "ep443", expected: true, why: "contains '443'" },
    // 4. plain-ish names
    { name: "web", expected: false, why: "contains 'web'" },
    { name: "http", expected: false, why: "contains 'http'" },
    { name: "port80", expected: false, why: "contains '80'" },
    { name: "WEB", expected: false, why: "case-insensitive" },
    // 5. default
    { name: "internal", expected: true, why: "unknown name defaults to TLS (legacy)" },
    { name: "metrics", expected: true, why: "unknown name defaults to TLS (legacy)" },
  ];

  for (const c of cases) {
    it(`${c.name} ${JSON.stringify(c.info ?? {})} -> ${c.expected} (${c.why})`, () => {
      expect(isTlsEntrypoint(c.name, c.info)).toBe(c.expected);
    });
  }
});

describe("resolveEntrypointTlsInfo", () => {
  beforeEach(() => {
    __resetEntrypointTlsCacheForTests();
    mocks.getEntrypoints.mockReset();
  });

  it("maps entrypoints to address + default-TLS info", async () => {
    mocks.getEntrypoints.mockResolvedValue([
      { name: "web", address: ":80" },
      { name: "websecure", address: ":443", http: { tls: {} } },
    ]);

    const map = await resolveEntrypointTlsInfo();
    expect(map.get("web")).toEqual({ address: ":80", hasDefaultTls: undefined });
    expect(map.get("websecure")).toEqual({ address: ":443", hasDefaultTls: true });
    expect(isTlsEntrypoint("websecure", map.get("websecure"))).toBe(true);
    expect(isTlsEntrypoint("web", map.get("web"))).toBe(false);
  });

  it("caches the result (single API call across two resolves)", async () => {
    mocks.getEntrypoints.mockResolvedValue([{ name: "web", address: ":80" }]);
    await resolveEntrypointTlsInfo();
    await resolveEntrypointTlsInfo();
    expect(mocks.getEntrypoints).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map when the Traefik API is unconfigured/unreachable", async () => {
    mocks.getEntrypoints.mockRejectedValue(new Error("TRAEFIK_API_URL is not configured"));
    const map = await resolveEntrypointTlsInfo();
    expect(map.size).toBe(0);
    // failure is briefly cached too
    await resolveEntrypointTlsInfo();
    expect(mocks.getEntrypoints).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good map when the API fails after a success (stale-while-error)", async () => {
    vi.useFakeTimers();
    try {
      mocks.getEntrypoints.mockResolvedValueOnce([
        { name: "websecure", address: ":443", http: { tls: {} } },
      ]);
      const good = await resolveEntrypointTlsInfo();
      expect(good.get("websecure")?.hasDefaultTls).toBe(true);

      // success TTL elapses, then the API goes away
      vi.advanceTimersByTime(31_000);
      mocks.getEntrypoints.mockRejectedValue(new Error("unreachable"));
      const stale = await resolveEntrypointTlsInfo();
      expect(stale).toBe(good); // the SAME map, not an empty one
      expect(stale.get("websecure")?.hasDefaultTls).toBe(true);
      expect(mocks.getEntrypoints).toHaveBeenCalledTimes(2);

      // failure TTL: no re-fetch inside it, retry after it
      vi.advanceTimersByTime(1_000);
      await resolveEntrypointTlsInfo();
      expect(mocks.getEntrypoints).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(5_000);
      mocks.getEntrypoints.mockResolvedValueOnce([{ name: "web", address: ":80" }]);
      const fresh = await resolveEntrypointTlsInfo();
      expect(mocks.getEntrypoints).toHaveBeenCalledTimes(3);
      expect(fresh.get("web")).toEqual({ address: ":80", hasDefaultTls: undefined });
      expect(fresh.has("websecure")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
