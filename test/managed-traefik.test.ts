/* Pure tests for the managed-Traefik static config model: the traefik.yml
 * builder (round-tripped through yaml.parse), validation, env helpers. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  buildStaticConfigObject,
  hashStaticConfig,
  hostOnly,
  isAuthorizedWrapperRequest,
  isManagedMode,
  isPublicDomainRequest,
  panelInternalUrl,
  parseAdminPanelAuthUsers,
  safeEqualStrings,
  serializeSecretsEnv,
  stringifyStaticConfig,
  wrapperToken,
} from "@/lib/managed-traefik";
import {
  applySecretEdits,
  DEFAULT_MANAGED_STATIC_CONFIG,
  isValidEnvName,
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

  it("rejects malformed acme emails", () => {
    for (const email of ["not-an-email", "a@b", "a b@c.d", "@c.d", "a@"]) {
      reject({ ...valid, certResolvers: [{ name: "le", email, challenge: "tlsChallenge" }] }, /email/);
    }
  });

  it("dnsProvider must be a catalog code or a lego-shaped custom code", () => {
    const dns = (dnsProvider: string): ManagedStaticConfig => ({
      ...valid,
      certResolvers: [{ name: "le", email: "a@b.c", challenge: "dnsChallenge", dnsProvider }],
    });
    expect(validateManagedStaticConfig(dns("cloudflare")).ok).toBe(true);
    // "Other (custom)" path: any lowercase alphanumeric lego code is accepted
    expect(validateManagedStaticConfig(dns("exoscale")).ok).toBe(true);
    expect(validateManagedStaticConfig(dns("rfc2136")).ok).toBe(true);
    reject(dns(""), /needs a DNS provider/);
    reject(dns("Cloud Flare"), /not a valid DNS provider code/);
    reject(dns("cloud-flare"), /not a valid DNS provider code/);
    reject(dns("$(evil)"), /not a valid DNS provider code/);
  });

  it("requires a TLS-capable entrypoint whenever a resolver exists", () => {
    reject(
      { ...valid, entrypoints: [{ name: "web", port: 80 }] },
      /no entrypoint has TLS enabled/
    );
    // no resolvers → plain http is fine
    expect(
      validateManagedStaticConfig({ entrypoints: [{ name: "web", port: 80 }], certResolvers: [] })
        .ok
    ).toBe(true);
  });

  it("type-checks fields instead of coercing (undefined name is not 'undefined')", () => {
    reject(
      { ...valid, entrypoints: [{ port: 80 } as unknown as ManagedStaticConfig["entrypoints"][0]] },
      /name must be a string/
    );
    reject(
      { ...valid, entrypoints: [{ name: "web", port: "80" as unknown as number }] },
      /port must be a number/
    );
    reject(
      {
        ...valid,
        entrypoints: [{ name: "web", port: 443, tls: { enabled: "yes" as unknown as boolean } }],
      },
      /tls.enabled must be a boolean/
    );
    reject(
      { ...valid, certResolvers: [{ name: "le", email: "a@b.c", challenge: 7 as unknown as "tlsChallenge" }] },
      /challenge must be a string/
    );
    reject("nope" as unknown as ManagedStaticConfig, /must be an object/);
    reject({ entrypoints: [], certResolvers: {} } as unknown as ManagedStaticConfig, /must be arrays/);
  });

  it("rejects unknown fields at every level rather than persisting them", () => {
    reject({ ...valid, extra: 1 } as unknown as ManagedStaticConfig, /Config: unknown field "extra"/);
    reject(
      { ...valid, entrypoints: [{ name: "web", port: 80, foo: "bar" } as unknown as ManagedStaticConfig["entrypoints"][0]] },
      /Entrypoint #1: unknown field "foo"/
    );
    reject(
      {
        ...valid,
        entrypoints: [
          { name: "websecure", port: 443, tls: { enabled: true, sneaky: true } as unknown as ManagedStaticConfig["entrypoints"][0]["tls"] },
        ],
      },
      /tls: unknown field "sneaky"/
    );
    reject(
      {
        ...valid,
        certResolvers: [
          { name: "le", email: "a@b.c", challenge: "tlsChallenge", storage: "/etc/passwd" } as unknown as ManagedStaticConfig["certResolvers"][0],
        ],
      },
      /Resolver #1: unknown field "storage"/
    );
  });

  it("returns a canonical copy: empty strings/nulls normalised, stale fields dropped", () => {
    const res = validateManagedStaticConfig({
      entrypoints: [
        { name: "web", port: 80, redirectToEntrypoint: null, tls: null },
        { name: "websecure", port: 443, tls: { enabled: true, certResolver: "" } },
      ],
      certResolvers: [
        // httpChallengeEntrypoint left over from a previous challenge choice
        { name: "le", email: " a@b.c ", challenge: "tlsChallenge", httpChallengeEntrypoint: "web" },
      ],
    });
    expect(res).toEqual({
      ok: true,
      value: {
        entrypoints: [
          { name: "web", port: 80 },
          { name: "websecure", port: 443, tls: { enabled: true } },
        ],
        certResolvers: [{ name: "le", email: "a@b.c", challenge: "tlsChallenge" }],
      },
    });
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

describe("DNS credentials (write-only secrets)", () => {
  it("isValidEnvName accepts shell env identifiers only", () => {
    expect(isValidEnvName("CF_DNS_API_TOKEN")).toBe(true);
    expect(isValidEnvName("AWS_ACCESS_KEY_ID")).toBe(true);
    expect(isValidEnvName("cf_token")).toBe(false); // lowercase
    expect(isValidEnvName("1TOKEN")).toBe(false); // leading digit
    expect(isValidEnvName("CF-TOKEN")).toBe(false); // dash
    expect(isValidEnvName("")).toBe(false);
  });

  it("serializeSecretsEnv emits sorted, shell-safe export lines", () => {
    const env = serializeSecretsEnv({ B_TOKEN: "two", A_TOKEN: "one" });
    expect(env).toBe("export A_TOKEN='one'\nexport B_TOKEN='two'\n");
  });

  it("serializeSecretsEnv escapes single quotes so sourcing is injection-safe", () => {
    // value: it's "$(rm -rf)" '  — must survive sh single-quote sourcing verbatim
    const env = serializeSecretsEnv({ X: `it's "$(rm -rf)" '` });
    expect(env).toBe(`export X='it'\\''s "$(rm -rf)" '\\'''\n`);
  });

  it("serializeSecretsEnv is empty for no secrets and skips invalid names", () => {
    expect(serializeSecretsEnv({})).toBe("");
    expect(serializeSecretsEnv({ "bad-name": "x", OK: "y" })).toBe(
      "export OK='y'\n"
    );
  });

  it("hostOnly strips ports (incl. IPv6), trailing dots, and lowercases", () => {
    expect(hostOnly("Admin.Example.COM:443")).toBe("admin.example.com");
    expect(hostOnly("traefik-configurator:3000")).toBe("traefik-configurator");
    expect(hostOnly("[::1]:3000")).toBe("[::1]");
    expect(hostOnly(null)).toBe("");
    // Traefik's Host() matcher ignores a trailing dot but forwards it verbatim
    expect(hostOnly("admin.example.com.")).toBe("admin.example.com");
    expect(hostOnly("admin.example.com.:443")).toBe("admin.example.com");
  });

  it("isPublicDomainRequest flags web requests, allows the internal wrapper", () => {
    const h = (init: Record<string, string>) => new Headers(init);
    const domain = "admin.example.com";
    // through Traefik's admin route: Host is the public domain → blocked
    expect(isPublicDomainRequest(h({ host: "admin.example.com" }), domain)).toBe(true);
    expect(
      isPublicDomainRequest(h({ "x-forwarded-host": "admin.example.com:443" }), domain)
    ).toBe(true);
    // the wrapper hitting the internal service name → allowed
    expect(
      isPublicDomainRequest(h({ host: "traefik-configurator:3000" }), domain)
    ).toBe(false);
    // a synthesized X-Forwarded-* without the public host must NOT block
    expect(
      isPublicDomainRequest(
        h({ host: "traefik-configurator:3000", "x-forwarded-for": "10.0.0.1" }),
        domain
      )
    ).toBe(false);
    // FQDN form reaches the admin router too — must still be flagged
    expect(isPublicDomainRequest(h({ host: "admin.example.com." }), domain)).toBe(true);
    expect(isPublicDomainRequest(h({ host: "ADMIN.example.com.:443" }), domain)).toBe(true);
  });

  it("wrapperToken reads MANAGED_WRAPPER_TOKEN, trimmed, null when blank", () => {
    vi.stubEnv("MANAGED_WRAPPER_TOKEN", "  tok  ");
    expect(wrapperToken()).toBe("tok");
    vi.stubEnv("MANAGED_WRAPPER_TOKEN", "   ");
    expect(wrapperToken()).toBeNull();
  });

  it("safeEqualStrings compares in constant time regardless of length", () => {
    expect(safeEqualStrings("abc", "abc")).toBe(true);
    expect(safeEqualStrings("abc", "abd")).toBe(false);
    expect(safeEqualStrings("abc", "abcd")).toBe(false);
    expect(safeEqualStrings("", "")).toBe(true);
  });

  it("isAuthorizedWrapperRequest requires the exact bearer token", () => {
    const h = (init: Record<string, string>) => new Headers(init);
    vi.stubEnv("MANAGED_WRAPPER_TOKEN", "s3cret-token");
    expect(isAuthorizedWrapperRequest(h({ authorization: "Bearer s3cret-token" }))).toBe(true);
    expect(isAuthorizedWrapperRequest(h({ authorization: "bearer s3cret-token" }))).toBe(true);
    expect(isAuthorizedWrapperRequest(h({ authorization: "Bearer s3cret-toke" }))).toBe(false);
    expect(isAuthorizedWrapperRequest(h({ authorization: "Bearer s3cret-token-x" }))).toBe(false);
    expect(isAuthorizedWrapperRequest(h({ authorization: "Basic s3cret-token" }))).toBe(false);
    expect(isAuthorizedWrapperRequest(h({ authorization: "s3cret-token" }))).toBe(false);
    expect(isAuthorizedWrapperRequest(h({}))).toBe(false);
    // the Host heuristic alone must never authorize
    expect(isAuthorizedWrapperRequest(h({ host: "traefik-configurator:3000" }))).toBe(false);
  });

  it("isAuthorizedWrapperRequest fails closed when no token is configured", () => {
    vi.stubEnv("MANAGED_WRAPPER_TOKEN", "");
    expect(isAuthorizedWrapperRequest(new Headers({ authorization: "Bearer " }))).toBe(false);
    expect(isAuthorizedWrapperRequest(new Headers({ authorization: "Bearer x" }))).toBe(false);
  });

  it("applySecretEdits upserts, removes (remove before upsert), and validates", () => {
    const cur = { CF_DNS_API_TOKEN: "old", STALE: "x" };
    const r = applySecretEdits(cur, {
      upsert: [{ name: "CF_DNS_API_TOKEN", value: "new" }],
      remove: ["STALE"],
    });
    expect(r).toEqual({ ok: true, value: { CF_DNS_API_TOKEN: "new" } });
  });

  it("applySecretEdits re-adding a removed name in one batch keeps it", () => {
    const r = applySecretEdits(
      { A: "1" },
      { upsert: [{ name: "A", value: "2" }], remove: ["A"] }
    );
    expect(r).toEqual({ ok: true, value: { A: "2" } });
  });

  it("applySecretEdits ignores malformed batches instead of coercing them", () => {
    const r = applySecretEdits(
      { A: "1" },
      { upsert: ["A" as unknown as { name: string; value: string }, { name: 5 as unknown as string, value: "x" }], remove: [7 as unknown as string] }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/must be an object|Invalid environment variable name/);
  });

  it("applySecretEdits rejects invalid names and empty values", () => {
    const bad = applySecretEdits(
      {},
      { upsert: [{ name: "cf-token", value: "x" }], remove: [] }
    );
    expect(bad.ok).toBe(false);
    const empty = applySecretEdits(
      {},
      { upsert: [{ name: "OK", value: "" }], remove: [] }
    );
    expect(empty.ok).toBe(false);
  });
});
