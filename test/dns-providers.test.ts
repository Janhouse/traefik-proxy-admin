/* Sanity checks for the DNS provider catalog: unique codes, valid env var
 * names, and a few known providers present with their expected fields. */
import { describe, expect, it } from "vitest";
import { DNS_PROVIDERS, findDnsProvider } from "@/lib/dns-providers";

describe("DNS_PROVIDERS catalog", () => {
  it("has unique provider codes", () => {
    const codes = DNS_PROVIDERS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every field uses a valid shell env var name and has a label", () => {
    for (const p of DNS_PROVIDERS) {
      expect(p.fields.length).toBeGreaterThan(0);
      for (const f of p.fields) {
        expect(f.env).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(f.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("every provider has at least one required field", () => {
    for (const p of DNS_PROVIDERS) {
      expect(p.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("findDnsProvider resolves known codes and rejects others", () => {
    expect(findDnsProvider("cloudflare")?.name).toBe("Cloudflare");
    expect(findDnsProvider("route53")?.fields.map((f) => f.env)).toContain(
      "AWS_SECRET_ACCESS_KEY"
    );
    expect(findDnsProvider("azuredns")?.fields.filter((f) => f.required).map((f) => f.env)).toEqual(
      ["AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID"]
    );
    expect(findDnsProvider("cloudflare")?.fields[0].env).toBe("CF_DNS_API_TOKEN");
    expect(findDnsProvider("nope")).toBeUndefined();
    expect(findDnsProvider(undefined)).toBeUndefined();
  });
});
