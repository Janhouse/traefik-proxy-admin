import { createHash } from "node:crypto";
import { stringify } from "yaml";
import type {
  ManagedCertResolver,
  ManagedEntrypoint,
  ManagedStaticConfig,
} from "@/lib/managed-traefik-types";

/* Server-side half of managed-Traefik mode: env switches and the
 * static-config (traefik.yml) builder. Types/validation live in
 * lib/managed-traefik-types.ts so client components can import them. */

/** Fully-managed mode: the panel owns Traefik's static config too. */
export function isManagedMode(): boolean {
  return process.env.TRAEFIK_MANAGED === "true";
}

/**
 * Base URL Traefik uses to reach the panel directly (forward-auth, config
 * polling, cert-trigger services). Inside the managed compose this is the
 * container address (PANEL_INTERNAL_URL=http://traefik-configurator:3000);
 * everywhere else it falls back to the public admin panel domain.
 */
export function panelInternalUrl(fallbackDomain: string): string {
  const raw = process.env.PANEL_INTERNAL_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return `http://${fallbackDomain}`;
}

/** Parse htpasswd entries ("user:hash") from env — newline and/or comma separated. */
export function parseAdminPanelAuthUsers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && u.includes(":"));
}

/* ── traefik.yml builder ──────────────────────────────────────────────────── */

function entrypointToStatic(ep: ManagedEntrypoint): Record<string, unknown> {
  const http: Record<string, unknown> = {};
  if (ep.redirectToEntrypoint) {
    http.redirections = {
      entryPoint: { to: ep.redirectToEntrypoint, scheme: "https" },
    };
  }
  if (ep.tls?.enabled) {
    http.tls = ep.tls.certResolver ? { certResolver: ep.tls.certResolver } : {};
  }
  return {
    address: `:${ep.port}`,
    ...(Object.keys(http).length > 0 && { http }),
  };
}

function resolverToStatic(r: ManagedCertResolver): Record<string, unknown> {
  const acme: Record<string, unknown> = {
    email: r.email,
    // Per-resolver storage — sharing one acme.json between resolvers corrupts it.
    storage: `/data/acme-${r.name}.json`,
  };
  if (r.challenge === "httpChallenge") {
    acme.httpChallenge = { entryPoint: r.httpChallengeEntrypoint };
  } else if (r.challenge === "dnsChallenge") {
    acme.dnsChallenge = { provider: r.dnsProvider };
  } else {
    acme.tlsChallenge = {};
  }
  return { acme };
}

/**
 * Build the full Traefik static config object. Fixed, opinionated defaults
 * for the managed bundle: API on :8080 (never published outside the compose
 * network — it's how the panel reads runtime state), Prometheus metrics with
 * full labels (the panel's traffic stats), and the HTTP provider polling the
 * panel for dynamic config.
 */
export function buildStaticConfigObject(
  cfg: ManagedStaticConfig,
  opts: { providerEndpoint: string; pollInterval?: string }
): Record<string, unknown> {
  const entryPoints: Record<string, unknown> = {};
  for (const ep of cfg.entrypoints) entryPoints[ep.name] = entrypointToStatic(ep);

  const certificatesResolvers: Record<string, unknown> = {};
  for (const r of cfg.certResolvers) certificatesResolvers[r.name] = resolverToStatic(r);

  return {
    log: { level: cfg.logLevel ?? "INFO" },
    api: { dashboard: true, insecure: true },
    metrics: {
      prometheus: {
        addEntryPointsLabels: true,
        addRoutersLabels: true,
        addServicesLabels: true,
      },
    },
    providers: {
      http: {
        endpoint: `${opts.providerEndpoint}/api/traefik/config`,
        pollInterval: opts.pollInterval ?? "5s",
      },
    },
    entryPoints,
    ...(Object.keys(certificatesResolvers).length > 0 && { certificatesResolvers }),
  };
}

export function stringifyStaticConfig(obj: Record<string, unknown>): string {
  return stringify(obj);
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function hashStaticConfig(yamlText: string): string {
  return hashText(yamlText);
}

/* ── DNS-provider credentials → Traefik env ───────────────────────────────── */

/**
 * Render credentials as a shell-sourceable dotenv for the Traefik wrapper.
 * Names are validated A–Z/0–9/underscore; values are single-quoted with
 * embedded single quotes escaped, so `. file` in POSIX sh is safe for
 * arbitrary value bytes (no interpolation, no word-splitting, no injection).
 */
export function serializeSecretsEnv(secrets: Record<string, string>): string {
  const names = Object.keys(secrets)
    .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name))
    .sort();
  if (names.length === 0) return "";
  return (
    names
      .map((name) => {
        const escaped = secrets[name].replace(/'/g, () => "'\\''");
        return `export ${name}='${escaped}'`;
      })
      .join("\n") + "\n"
  );
}

/** Host portion (lowercased, no port) of an authority like
 * "admin.example.com:443" or "[::1]:3000". */
export function hostOnly(authority: string | null | undefined): string {
  if (!authority) return "";
  const a = authority.trim().toLowerCase();
  const m = a.match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
  return m ? m[1] : a;
}

/**
 * True if a request reached the panel via its PUBLIC admin domain — i.e.
 * through Traefik's admin route, which is the only way the panel is exposed
 * to the web (port 3000 is unpublished). The auto-generated admin router
 * matches Host(adminPanelDomain) and passes the host through, so a web
 * request always arrives with that Host; the in-network wrapper reaches the
 * panel by its internal service name, so its Host never matches.
 *
 * We can't key off X-Forwarded-* presence: Next.js synthesizes those headers
 * even for direct connections, so they're useless as a proxy signal here.
 */
export function isPublicDomainRequest(
  headers: Headers,
  adminPanelDomain: string
): boolean {
  const pub = hostOnly(adminPanelDomain);
  if (!pub) return false;
  return (
    hostOnly(headers.get("host")) === pub ||
    hostOnly(headers.get("x-forwarded-host")) === pub
  );
}
