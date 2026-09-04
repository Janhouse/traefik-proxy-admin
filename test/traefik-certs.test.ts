/* /api/certificates mapping: Go marshals a nil `sans` slice as JSON null, so
 * a SAN-less cert must not 500 the whole list. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: { configured: true, certs: [] as unknown[], fail: null as Error | null },
}));

vi.mock("@/lib/traefik-api", () => ({
  isTraefikApiConfigured: vi.fn(() => h.state.configured),
  getCertificates: vi.fn(async () => {
    if (h.state.fail) throw h.state.fail;
    return h.state.certs;
  }),
}));

import { getCertificates } from "@/lib/traefik-certs";

const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
const base = {
  name: "abc",
  notAfter: soon,
  notBefore: new Date().toISOString(),
  serialNumber: "1",
  version: "3",
  keyType: "ECDSA",
  signatureAlgorithm: "ECDSA-SHA256",
  certFingerprint: "abc",
  publicKeyFingerprint: "def",
  status: "enabled",
};

beforeEach(() => {
  h.state.configured = true;
  h.state.certs = [];
  h.state.fail = null;
});

describe("getCertificates", () => {
  it("tolerates a null sans list and falls back for commonName", async () => {
    h.state.certs = [
      { ...base, commonName: "", sans: null },
      { ...base, name: "two", commonName: "", sans: ["x.example"] },
    ];
    const res = await getCertificates();
    expect(res.reachable).toBe(true);
    expect(res.supported).toBe(true);
    expect(res.certificates).toHaveLength(2);
    const noSans = res.certificates.find((c) => c.name === "abc")!;
    expect(noSans.sans).toEqual([]);
    expect(noSans.commonName).toBe("—");
    const withSans = res.certificates.find((c) => c.name === "two")!;
    expect(withSans.commonName).toBe("x.example");
    expect(withSans.daysRemaining).toBeGreaterThanOrEqual(9);
  });

  it("maps a 404 to supported: false", async () => {
    h.state.fail = Object.assign(new Error("responded 404"), { status: 404 });
    const res = await getCertificates();
    expect(res).toMatchObject({ reachable: true, supported: false, certificates: [] });
  });
});
