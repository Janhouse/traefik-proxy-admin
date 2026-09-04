/* ADMIN_PANEL_DOMAIN bootstrap seed for the managed bundle: seeds the admin
 * domain only in managed mode and only while the stored value is still the
 * default, so a domain set in the UI always wins. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
  appConfig: {},
}));

import { adminPanelDomainSeed, normalizeGlobalConfig } from "@/lib/app-config";

const fresh = () => normalizeGlobalConfig({});

describe("adminPanelDomainSeed", () => {
  it("seeds from ADMIN_PANEL_DOMAIN in managed mode when the domain is still the default", () => {
    expect(adminPanelDomainSeed(fresh(), { ADMIN_PANEL_DOMAIN: "Admin.Example.com/", managed: true })).toBe(
      "admin.example.com"
    );
  });

  it("is a no-op outside managed mode, when unset/blank, or when equal to the default", () => {
    expect(adminPanelDomainSeed(fresh(), { ADMIN_PANEL_DOMAIN: "admin.example.com", managed: false })).toBeNull();
    expect(adminPanelDomainSeed(fresh(), { managed: true })).toBeNull();
    expect(adminPanelDomainSeed(fresh(), { ADMIN_PANEL_DOMAIN: "   ", managed: true })).toBeNull();
    expect(adminPanelDomainSeed(fresh(), { ADMIN_PANEL_DOMAIN: "localhost:3000", managed: true })).toBeNull();
  });

  it("never overrides a domain that was set in the UI", () => {
    const cfg = normalizeGlobalConfig({ adminPanelDomain: "panel.internal" });
    expect(adminPanelDomainSeed(cfg, { ADMIN_PANEL_DOMAIN: "admin.example.com", managed: true })).toBeNull();
  });
});
