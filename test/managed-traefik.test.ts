/* Pure tests for the managed-Traefik static config model: the traefik.yml
 * builder (round-tripped through yaml.parse), validation, env helpers. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  buildStaticConfigObject,
  hashStaticConfig,
  isManagedMode,
  panelInternalUrl,
  parseAdminPanelAuthUsers,
  stringifyStaticConfig,
} from "@/lib/managed-traefik";
import {
  DEFAULT_MANAGED_STATIC_CONFIG,
  validateManagedStaticConfig,
  type ManagedStaticConfig,
} from "@/lib/managed-traefik-types";

afterEach(() => vi.unstubAllEnvs());

const OPTS = { providerEndpoint: "http://traefik-configurator:3000" };

describe("buildStaticConfigObject", () => {
  it("builds the documented defaults: redirect on web, TLS on websecure, http provider", () => {
    const yamlText = stringifyStaticConfig(
      buildStaticConfigObject(DEFAULT_MANAGED_STATIC_CONFIG, OPTS)
    );
    const cfg = parse(yamlText);

    expect(cfg.entryPoints.web.address).toBe(":80");
    expect(cfg.entryPoints.web.http.redirections.entryPoint).toEqual({
      to: "websecure",
      scheme: "https",
    });
    expect(cfg.entryPoints.websecure.address).toBe(":443");
    expect(cfg.entryPoints.websecure.http.tls).toEqual({
      certResolver: "letsencrypt",
    });
    expect(cfg.certificatesResolvers.letsencrypt.acme.tlsChallenge).toEqual({});
    expect(cfg.certificatesResolvers.letsencrypt.acme.storage).toBe(
      "/data/acme-letsencrypt.json"
    );
    expect(cfg.providers.http).toEqual({
      endpoint: "http://traefik-configurator:3000/api/traefik/config",
      pollInterval: "5s",
    });
    expect(cfg.api).toEqual({ dashboard: true, insecure: true });
    expect(cfg.metrics.prometheus.addRoutersLabels).toBe(true);
    expect(cfg.log.level).toBe("INFO");
  });

  it("emits httpChallenge and dnsChallenge acme blocks", () => {
    const cfg: ManagedStaticConfig = {
      entrypoints: [{ name: "web", port: 80 }],
      certResolvers: [
        {
          name: "le-http",
          email: "a@b.c",
          challenge: "httpChallenge",
          httpChallengeEntrypoint: "web",
        },
        {
          name: "le-dns",
          email: "a@b.c",
          challenge: "dnsChallenge",
          dnsProvider: "cloudflare",
        },
      ],
    };
    const parsed = parse(stringifyStaticConfig(buildStaticConfigObject(cfg, OPTS)));
    expect(parsed.certificatesResolvers["le-http"].acme.httpChallenge).toEqual({
      entryPoint: "web",
    });
    expect(parsed.certificatesResolvers["le-dns"].acme.dnsChallenge).toEqual({
      provider: "cloudflare",
    });
    // separate storage per resolver — a shared acme.json corrupts
    expect(parsed.certificatesResolvers["le-http"].acme.storage).not.toBe(
      parsed.certificatesResolvers["le-dns"].acme.storage
    );
  });

  it("omits certificatesResolvers entirely when none are configured", () => {
    const cfg: ManagedStaticConfig = {
      entrypoints: [{ name: "web", port: 80 }],
      certResolvers: [],
    };
    const parsed = parse(stringifyStaticConfig(buildStaticConfigObject(cfg, OPTS)));
    expect(parsed.certificatesResolvers).toBeUndefined();
    expect(parsed.entryPoints.web).toEqual({ address: ":80" });
  });

  it("hash is stable for identical configs and differs on change", () => {
    const a = stringifyStaticConfig(
      buildStaticConfigObject(DEFAULT_MANAGED_STATIC_CONFIG, OPTS)
    );
    const b = stringifyStaticConfig(
      buildStaticConfigObject(
        { ...DEFAULT_MANAGED_STATIC_CONFIG, logLevel: "DEBUG" },
        OPTS
      )
    );
    expect(hashStaticConfig(a)).toBe(hashStaticConfig(a));
    expect(hashStaticConfig(a)).not.toBe(hashStaticConfig(b));
  });
});

describe("validateManagedStaticConfig", () => {
  const valid: ManagedStaticConfig = {
    entrypoints: [
      { name: "web", port: 80, redirectToEntrypoint: "websecure" },
      { name: "websecure", port: 443, tls: { enabled: true, certResolver: "le" } },
    ],
    certResolvers: [{ name: "le", email: "admin@example.com", challenge: "tlsChallenge" }],
    logLevel: "INFO",
  };

  it("accepts a sane config", () => {
    expect(validateManagedStaticConfig(valid)).toEqual({ ok: true, value: valid });
  });

  const reject = (cfg: ManagedStaticConfig, match: RegExp) => {
    const res = validateManagedStaticConfig(cfg);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join("\n")).toMatch(match);
  };

  it("rejects duplicate entrypoint names and ports", () => {
    reject(
      {
        ...valid,
        entrypoints: [
          { name: "web", port: 80 },
          { name: "web", port: 81 },
        ],
      },
      /Duplicate entrypoint name/
    );
    reject(
      {
        ...valid,
        entrypoints: [
          { name: "a", port: 80 },
          { name: "b", port: 80 },
        ],
      },
      /port 80 is already used/
    );
  });

  it("rejects bad ports and names", () => {
    reject({ ...valid, entrypoints: [{ name: "web", port: 0 }] }, /port must be/);
    reject({ ...valid, entrypoints: [{ name: "web!", port: 80 }] }, /alphanumeric/);
    reject({ ...valid, entrypoints: [] }, /At least one entrypoint/);
  });

  it("rejects dangling references (redirect target, TLS resolver, http challenge ep)", () => {
    reject(
      { ...valid, entrypoints: [{ name: "web", port: 80, redirectToEntrypoint: "nope" }] },
      /redirect target "nope"/
    );
    reject(
      { ...valid, entrypoints: [{ name: "web", port: 80, redirectToEntrypoint: "web" }] },
      /redirect to itself/
    );
    reject(
      {
        ...valid,
        entrypoints: [{ name: "web", port: 80, tls: { enabled: true, certResolver: "ghost" } }],
      },
      /resolver "ghost" is not defined/
    );
    reject(
      {
        ...valid,
        certResolvers: [
          { name: "le", email: "a@b.c", challenge: "httpChallenge", httpChallengeEntrypoint: "nope" },
        ],
      },
      /httpChallenge needs an existing entrypoint/
    );
  });

  it("rejects missing acme email and missing dns provider", () => {
    reject(
      { ...valid, certResolvers: [{ name: "le", email: "", challenge: "tlsChallenge" }] },
      /email is required/
    );
    reject(
      { ...valid, certResolvers: [{ name: "le", email: "a@b.c", challenge: "dnsChallenge" }] },
      /needs a DNS provider/
    );
  });
});

describe("env helpers", () => {
  it("isManagedMode requires the exact string 'true'", () => {
    vi.stubEnv("TRAEFIK_MANAGED", "true");
    expect(isManagedMode()).toBe(true);
    vi.stubEnv("TRAEFIK_MANAGED", "1");
    expect(isManagedMode()).toBe(false);
    vi.stubEnv("TRAEFIK_MANAGED", "");
    expect(isManagedMode()).toBe(false);
  });

  it("panelInternalUrl prefers PANEL_INTERNAL_URL, trimmed of trailing slashes", () => {
    vi.stubEnv("PANEL_INTERNAL_URL", "http://panel:3000//");
    expect(panelInternalUrl("admin.example.com")).toBe("http://panel:3000");
  });

  it("panelInternalUrl falls back to http://<adminPanelDomain>", () => {
    vi.stubEnv("PANEL_INTERNAL_URL", "");
    expect(panelInternalUrl("admin.example.com")).toBe("http://admin.example.com");
  });

  it("parseAdminPanelAuthUsers splits commas and newlines, drops junk", () => {
    expect(
      parseAdminPanelAuthUsers("admin:$apr1$abc,  ops:$2y$xyz \n broken \n\n")
    ).toEqual(["admin:$apr1$abc", "ops:$2y$xyz"]);
    expect(parseAdminPanelAuthUsers(undefined)).toEqual([]);
    expect(parseAdminPanelAuthUsers("")).toEqual([]);
  });
});
