import { describe, expect, it } from "vitest";
import {
  mapServiceRequestBody,
  validateServiceRequestBody,
} from "@/lib/service-request-mapping";
import type { RuleNode } from "@/lib/route-rule";
import type { CreateServiceRequest } from "@/lib/dto/service.dto";

const base: CreateServiceRequest = {
  name: "svc",
  subdomain: "app",
  hostnameMode: "subdomain",
  domainId: "d1",
  targetIp: "10.0.0.1",
  targetPort: 80,
};

describe("mapServiceRequestBody — entrypoint lifecycle", () => {
  it("clears the legacy entrypoint whenever an entrypoints array is sent", () => {
    const row = mapServiceRequestBody({
      ...base,
      entrypoint: "web", // stale legacy value still sent by the form
      entrypoints: ["websecure", "internal"],
    });
    expect(row.entrypoint).toBeNull();
    expect(row.entrypoints).toBe('["websecure","internal"]');
  });

  it("stores null (not \"[]\") when every entrypoint is deselected — and still clears legacy", () => {
    const row = mapServiceRequestBody({
      ...base,
      entrypoint: "web",
      entrypoints: [],
    });
    expect(row.entrypoints).toBeNull();
    expect(row.entrypoint).toBeNull(); // the resurrection bug: this must NOT stay "web"
  });

  it("keeps the legacy entrypoint when no array is sent (pre-editor clients)", () => {
    const row = mapServiceRequestBody({ ...base, entrypoint: "web" });
    expect(row.entrypoint).toBe("web");
    expect(row.entrypoints).toBeNull();
  });
});

describe("mapServiceRequestBody — match rules", () => {
  it("stores the tree as JSON and empty arrays as null", () => {
    const tree = [
      {
        kind: "group" as const,
        conn: "AND" as const,
        children: [{ type: "PathPrefix" as const, conn: "AND" as const, value: "/api" }],
      },
    ];
    expect(mapServiceRequestBody({ ...base, matchRules: tree }).matchRules).toBe(
      JSON.stringify(tree)
    );
    expect(mapServiceRequestBody({ ...base, matchRules: [] }).matchRules).toBeNull();
    expect(mapServiceRequestBody(base).matchRules).toBeNull();
  });
});

describe("validateServiceRequestBody — match rule gate (400s)", () => {
  // untyped on purpose: these are the crafted bodies the API must refuse
  const raw = (matchRules: unknown) =>
    validateServiceRequestBody({ ...base, matchRules: matchRules as RuleNode[] });

  it("passes bodies without rules and with a well-formed tree", () => {
    expect(validateServiceRequestBody(base)).toBeNull();
    expect(raw([])).toBeNull();
    expect(
      raw([
        { type: "Host", conn: "AND", domainId: "d1", sub: "app" },
        { type: "PathPrefix", conn: "AND", value: "/api" },
      ])
    ).toBeNull();
  });

  it("rejects the matcher-type injection string", () => {
    expect(raw([{ type: "Host(`x`) || PathPrefix", conn: "AND", value: "/" }])).toMatch(
      /Unknown match rule type/
    );
  });

  it("rejects typo'd types, empty arguments, bad paths and non-hostnames", () => {
    expect(raw([{ type: "PathPrefx", conn: "AND", value: "/api" }])).toMatch(/Unknown match rule type/);
    expect(raw([{ type: "PathPrefix", conn: "AND", value: "" }])).toMatch(/needs a path/);
    expect(raw([{ type: "Path", conn: "AND", value: "healthz" }])).toMatch(/must start with/);
    expect(raw([{ type: "Host", conn: "AND", value: "bad host" }])).toMatch(/Invalid hostname/);
    expect(raw([{ type: "Host", conn: "AND", value: "a`)||PathPrefix(`/" }])).toMatch(/Invalid hostname/);
    expect(raw([{ type: "Header", conn: "AND", key: "", value: "1" }])).toMatch(/needs a key/);
  });
});

describe("mapServiceRequestBody — defaults and passthrough", () => {
  it("applies the documented defaults", () => {
    const row = mapServiceRequestBody(base);
    expect(row).toMatchObject({
      name: "svc",
      subdomain: "app",
      isHttps: false,
      insecureSkipVerify: false,
      enabled: true,
      enableDurationMinutes: null,
      middlewares: null,
      requestHeaders: null,
      customHostnames: null,
    });
  });

  it("serializes middlewares/customHostnames/requestHeaders", () => {
    const row = mapServiceRequestBody({
      ...base,
      subdomain: undefined,
      hostnameMode: "custom",
      customHostnames: ["a.example.com"],
      middlewares: ["compress"],
      requestHeaders: { Host: "internal.local" },
    });
    expect(row.subdomain).toBeNull();
    expect(row.customHostnames).toBe('["a.example.com"]');
    expect(row.middlewares).toBe('["compress"]');
    expect(row.requestHeaders).toBe('{"Host":"internal.local"}');
  });

  it("keeps falsy-but-meaningful values via ??", () => {
    const row = mapServiceRequestBody({
      ...base,
      isHttps: false,
      enabled: false,
      enableDurationMinutes: 0,
    });
    expect(row.enabled).toBe(false);
    expect(row.enableDurationMinutes).toBe(0);
  });
});
