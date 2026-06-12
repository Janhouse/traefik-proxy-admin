/* Pins normalizeGlobalConfig: the legacy single `defaultEntrypoint` migrates
 * into `defaultEntrypoints` on read, and an explicit array always wins. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
  appConfig: {},
}));

import { normalizeGlobalConfig } from "@/lib/app-config";

describe("normalizeGlobalConfig", () => {
  it("fills defaults for an empty payload", () => {
    const cfg = normalizeGlobalConfig({});
    expect(cfg.adminPanelDomain).toBe("localhost:3000");
    expect(cfg.globalMiddlewares).toEqual([]);
    expect(cfg.defaultEntrypoints).toEqual([]);
    expect(cfg.defaultEnableDurationMinutes).toBe(720);
    expect("defaultEntrypoint" in cfg).toBe(false);
  });

  it("migrates the legacy single defaultEntrypoint into the array", () => {
    const cfg = normalizeGlobalConfig({ defaultEntrypoint: "websecure" });
    expect(cfg.defaultEntrypoints).toEqual(["websecure"]);
    expect("defaultEntrypoint" in cfg).toBe(false);
  });

  it("prefers an explicit defaultEntrypoints array over the legacy value", () => {
    const cfg = normalizeGlobalConfig({
      defaultEntrypoint: "web",
      defaultEntrypoints: ["websecure", "metrics"],
    });
    expect(cfg.defaultEntrypoints).toEqual(["websecure", "metrics"]);
  });

  it("an explicit empty array means none — the legacy value must not resurrect", () => {
    const cfg = normalizeGlobalConfig({
      defaultEntrypoint: "web",
      defaultEntrypoints: [],
    });
    expect(cfg.defaultEntrypoints).toEqual([]);
  });

  it("drops empty/non-string entries from the array", () => {
    const cfg = normalizeGlobalConfig({
      defaultEntrypoints: ["web", "", 7 as unknown as string, "websecure"],
    });
    expect(cfg.defaultEntrypoints).toEqual(["web", "websecure"]);
  });

  it("keeps user values over defaults (incl. explicit null duration = forever)", () => {
    const cfg = normalizeGlobalConfig({
      adminPanelDomain: "admin.example.com",
      defaultEnableDurationMinutes: null as unknown as number,
    });
    expect(cfg.adminPanelDomain).toBe("admin.example.com");
    expect(cfg.defaultEnableDurationMinutes).toBeNull();
  });
});
