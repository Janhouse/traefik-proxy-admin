import "server-only";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";
import { assembleRule, parseEntrypoints, parseMatchRules } from "@/lib/route-rule";
import {
  isTlsEntrypoint,
  resolveEntrypointTlsInfo,
  type EntrypointTlsInfo,
} from "./entrypoint-tls";
import { getGlobalConfig, type GlobalTraefikConfig } from "./app-config";
import { BasicAuthService } from "./services/basic-auth.service";
import { ServiceSecurityService } from "./services/service-security.service";
import { TRAEFIK_SESSION_COOKIE } from "./constants";
import type { Service, Domain } from "@/lib/db/schema";
import type { CertificateConfig } from "@/lib/dto/domain.dto";

export interface TraefikService {
  loadBalancer: {
    servers: Array<{
      url: string;
    }>;
    serversTransport?: string;
  };
}

export interface TraefikRouter {
  rule: string;
  service: string;
  middlewares?: string[];
  entryPoints?: string[];
  tls?: {
    certResolver?: string;
    domains?: Array<{
      main: string;
      sans?: string[];
    }>;
  };
}

export interface TraefikMiddleware {
  forwardAuth?: {
    address: string;
    trustForwardHeader?: boolean;
    authRequestHeaders?: string[];
    addAuthCookiesToResponse?: string[];
  };
  basicAuth?: {
    users: string[];
  };
  redirectScheme?: {
    scheme: string;
    permanent?: boolean;
  };
  redirectRegex?: {
    regex: string;
    replacement: string;
    permanent?: boolean;
  };
  replacePath?: {
    path: string;
  };
  headers?: {
    customRequestHeaders?: Record<string, string>;
    customResponseHeaders?: Record<string, string>;
  };
  [key: string]: unknown; // Allow for custom middleware configurations
}

export interface TraefikConfig {
  http: {
    services: Record<string, TraefikService>;
    routers: Record<string, TraefikRouter>;
    middlewares?: Record<string, TraefikMiddleware>;
    serversTransports?: Record<string, {
      insecureSkipVerify?: boolean;
    }>;
  };
}

/**
 * Parse service-specific middlewares from string format
 */
function parseServiceMiddlewares(middlewares: string): string[] {
  try {
    // Try to parse as JSON first (for array format)
    const parsed = JSON.parse(middlewares);
    if (Array.isArray(parsed)) {
      return parsed;
    } else {
      // If it's not an array, treat it as a single middleware
      return [parsed];
    }
  } catch {
    // If JSON parsing fails, treat it as a plain string (single middleware)
    const trimmed = middlewares.trim();
    return trimmed ? [trimmed] : [];
  }
}

/**
 * Parse certificate configurations from JSON string
 */
function parseCertificateConfigs(certificateConfigs: string | null): CertificateConfig[] {
  if (!certificateConfigs) return [];
  try {
    const parsed = JSON.parse(certificateConfigs);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to parse certificate configs:", error);
    return [];
  }
}

/**
 * Parse custom hostnames from JSON string
 */
function parseCustomHostnames(customHostnames: string | null): string[] {
  if (!customHostnames) return [];
  try {
    const parsed = JSON.parse(customHostnames);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to parse custom hostnames:", error);
    return [];
  }
}

/**
 * Generate service identifier based on hostname mode.
 * Exported so the metrics scraper can map a Traefik `router-<identifier>` label
 * back to the owning admin service.
 *
 * Subdomain mode includes the domain ("app" + "example.com" → "app-example-com")
 * so the same subdomain under two different domains can't silently overwrite
 * each other's routers/services/middlewares.
 */
export function generateServiceIdentifier(service: Service, domain: Domain): string {
  switch (service.hostnameMode) {
    case 'subdomain':
      return service.subdomain
        ? `${service.subdomain}.${domain.domain}`.replace(/\./g, '-')
        : 'default';
    case 'apex':
      return domain.domain.replace(/\./g, '-');
    case 'custom':
      // Use first custom hostname or service ID as fallback
      const customHostnames = parseCustomHostnames(service.customHostnames);
      const firstHostname = customHostnames[0] || service.id.substring(0, 8);
      return firstHostname.replace(/\./g, '-');
    default:
      return service.subdomain || service.id.substring(0, 8);
  }
}

/** Slug an entrypoint name for use inside a router name. */
function slugifyEntrypoint(ep: string): string {
  return ep.replace(/[^a-zA-Z0-9]/g, '-');
}

/** Router names emitted for a given identifier + resolved entrypoint list. */
function routerNamesForIdentifier(identifier: string, eps: string[]): string[] {
  const base = `router-${identifier}`;
  if (eps.length <= 1) return [base];
  return [base, ...eps.map((ep) => `${base}-${slugifyEntrypoint(ep)}`)];
}

/**
 * All router names this service may appear under in Traefik. With multiple
 * entrypoints, one router per entrypoint is emitted (`router-<id>-<ep>`); the
 * un-suffixed base name is included too so a stale runtime (old config still
 * loaded) keeps mapping back to the service.
 */
/**
 * Resolve a service's entrypoint list from its columns. A non-null
 * `entrypoints` column owns the truth even when it parses empty ("[]" was only
 * ever written by the editor meaning "none selected") — only a null column
 * (genuine pre-array rows) falls back to the legacy single `entrypoint`.
 */
export function resolveServiceEntrypoints(service: Service): string[] {
  if (service.entrypoints !== null && service.entrypoints !== undefined) {
    return parseEntrypoints(service.entrypoints);
  }
  return service.entrypoint ? [service.entrypoint] : [];
}

export function serviceRouterNames(service: Service, domain: Domain): string[] {
  const eps = resolveServiceEntrypoints(service);
  const identifier = generateServiceIdentifier(service, domain);
  // Identifier collisions during generation get a deterministic `-<serviceId8>`
  // suffix (see createTraefikService); include those names too so a collided
  // service still maps back instead of surfacing as a foreign router.
  return [
    ...routerNamesForIdentifier(identifier, eps),
    ...routerNamesForIdentifier(`${identifier}-${service.id.slice(0, 8)}`, eps),
  ];
}

/** Path matcher appended to cert-trigger router rules so they can never steal
 * real traffic from a service that claims the same Host(). */
const CERT_TRIGGER_PATH = "/.well-known/traefik-cert-trigger";

/** Exact router name of the wildcard cert trigger generated for a domain. */
export function wildcardCertRouterName(domain: Domain): string {
  return `wildcard-cert-router-${domain.domain.replace(/\./g, '-')}`;
}

/** Exact router names of the per-certificate-config triggers for a domain. */
export function certTriggerRouterNames(domain: Domain): string[] {
  return parseCertificateConfigs(domain.certificateConfigs).map(
    (certConfig) =>
      `cert-router-${certConfig.name.replace(/[^a-zA-Z0-9]/g, '-')}-${certConfig.main.replace(/\./g, '-')}`
  );
}

/**
 * Generate hostnames for a service based on hostname mode
 */
function generateServiceHostnames(service: Service, domain: Domain): string[] {
  switch (service.hostnameMode) {
    case 'subdomain':
      if (!service.subdomain) {
        console.warn(`Service ${service.id} is in subdomain mode but has no subdomain`);
        return [];
      }
      return [`${service.subdomain}.${domain.domain}`];
    case 'apex':
      return [domain.domain];
    case 'custom':
      return parseCustomHostnames(service.customHostnames);
    default:
      console.warn(`Unknown hostname mode: ${service.hostnameMode}`);
      return [];
  }
}

/**
 * Build middlewares array for a service with multiple security configurations
 */
async function buildServiceMiddlewares(
  service: Service,
  serviceIdentifier: string,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): Promise<string[]> {
  const middlewares: string[] = [];

  // Add global middlewares first
  if (globalConfig.globalMiddlewares.length > 0) {
    middlewares.push(...globalConfig.globalMiddlewares);
  }

  // Get all enabled security configurations for this service, ordered by priority
  const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(service.id);

  // Process each security configuration
  for (const securityConfig of securityConfigs) {
    const configData = JSON.parse(securityConfig.config);

    switch (securityConfig.securityType) {
      case "shared_link":
      case "sso":
        // Both shared_link and sso use forward auth
        const authMiddlewareName = `auth-${securityConfig.securityType}-${serviceIdentifier}`;
        config.http.middlewares![authMiddlewareName] = {
          forwardAuth: {
            address: `http://${globalConfig.adminPanelDomain}/api/auth/verify?serviceId=${service.id}&configId=${securityConfig.id}`,
            trustForwardHeader: true,
            addAuthCookiesToResponse: [TRAEFIK_SESSION_COOKIE],
            authRequestHeaders: ["Accept", "Cookie", "X-Forwarded-Proto", "X-Forwarded-Host", "X-Forwarded-Uri"],
          },
        };
        middlewares.push(authMiddlewareName);
        break;

      case "basic_auth":
        // Handle basic auth
        if (configData.basicAuthConfigId) {
          const authUsers = await BasicAuthService.getUsersWithHashesByConfigId(configData.basicAuthConfigId);

          if (authUsers.length > 0) {
            const basicAuthMiddlewareName = `basic-auth-${serviceIdentifier}-${securityConfig.id.substring(0, 8)}`;
            const userStrings = authUsers.map(user => `${user.username}:${user.passwordHash}`);

            config.http.middlewares![basicAuthMiddlewareName] = {
              basicAuth: {
                users: userStrings,
              },
            };
            middlewares.push(basicAuthMiddlewareName);
          }
        }
        break;

      default:
        console.warn(`Unknown security type: ${securityConfig.securityType}`);
    }
  }

  // Add request headers middleware if service has custom headers
  if (service.requestHeaders) {
    try {
      let headers = JSON.parse(service.requestHeaders);

      // Handle double-stringified data (bug fix - can be removed after DB migration)
      if (typeof headers === 'string') {
        headers = JSON.parse(headers);
      }

      if (headers && typeof headers === 'object' && Object.keys(headers).length > 0) {
        const headersMiddlewareName = `headers-${serviceIdentifier}`;
        config.http.middlewares![headersMiddlewareName] = {
          headers: {
            customRequestHeaders: headers,
          },
        };
        middlewares.push(headersMiddlewareName);
      }
    } catch (error) {
      console.warn(`Failed to parse request headers for service ${serviceIdentifier}:`, error);
    }
  }

  // Add service-specific middlewares (non-auth middlewares)
  if (service.middlewares) {
    const serviceMiddlewares = parseServiceMiddlewares(service.middlewares);
    middlewares.push(...serviceMiddlewares);
  }

  return middlewares;
}

/**
 * Create Traefik service configuration for a single service.
 *
 * Emits one router PER entrypoint (identical rule/service/middlewares) so a
 * service spanning plain-HTTP and TLS entrypoints works on both: a single
 * router with `tls` would be HTTPS-only on EVERY bound entrypoint, dead-ending
 * plain-HTTP ones (web:80).
 *
 * Returns true when the emitted TLS config requests this domain's wildcard
 * certificate (main=domain, sans includes *.domain) so the caller can skip the
 * redundant wildcard cert-trigger router.
 */
async function createTraefikService(
  service: Service,
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig,
  epTlsInfo: Map<string, EntrypointTlsInfo>,
  usedIdentifiers: Set<string>
): Promise<boolean> {
  let serviceIdentifier = generateServiceIdentifier(service, domain);
  // Identifier collision (e.g. two services resolving to the same slug) —
  // disambiguate instead of silently overwriting the first service's objects.
  if (usedIdentifiers.has(serviceIdentifier)) {
    serviceIdentifier = `${serviceIdentifier}-${service.id.slice(0, 8)}`;
  }
  usedIdentifiers.add(serviceIdentifier);

  const serviceName = `service-${serviceIdentifier}`;
  const protocol = service.isHttps ? "https" : "http";

  // Get hostnames for this service
  const hostnames = generateServiceHostnames(service, domain);
  if (hostnames.length === 0) {
    console.warn(`Service ${service.id} has no valid hostnames, skipping`);
    return false;
  }

  // Service configuration
  const serviceConfig: TraefikService = {
    loadBalancer: {
      servers: [
        {
          url: `${protocol}://${service.targetIp}:${service.targetPort}`,
        },
      ],
    },
  };

  // Add serversTransport if insecureSkipVerify is enabled for HTTPS services
  if (service.isHttps && service.insecureSkipVerify) {
    const transportName = `insecure-transport-${serviceIdentifier}`;
    serviceConfig.loadBalancer.serversTransport = transportName;

    // Ensure serversTransports object exists
    if (!config.http.serversTransports) {
      config.http.serversTransports = {};
    }

    // Add the serversTransport configuration
    config.http.serversTransports[transportName] = {
      insecureSkipVerify: true,
    };
  }

  config.http.services[serviceName] = serviceConfig;

  // Build the middlewares array ONCE and reuse the exact same array for every
  // emitted router — guarantees identical middlewares across all entrypoints.
  const middlewares = await buildServiceMiddlewares(service, serviceIdentifier, globalConfig, config);

  // Build the router rule. Legacy `custom` services (no structured matchers)
  // keep the Host(a) || Host(b) form; everything else assembles the primary
  // Host + structured matchers via the shared assembler (same as the UI preview).
  const matchRules = parseMatchRules(service.matchRules);
  const rule =
    service.hostnameMode === "custom" && matchRules.length === 0
      ? hostnames.map((hostname) => `Host(\`${hostname}\`)`).join(" || ")
      : assembleRule(hostnames[0], matchRules);

  // Determine certificate configuration (uses the primary host + wildcard logic)
  const tlsConfig = determineTlsConfig(service, domain, hostnames);

  // Entrypoints: the array column (legacy single for pre-array rows), then the
  // global default. An explicitly-empty array must NOT resurrect the legacy
  // single — that's the "deselected entrypoint comes back" bug.
  const epList = resolveServiceEntrypoints(service);
  const entryPoints = epList.length
    ? epList
    : globalConfig.defaultEntrypoint
      ? [globalConfig.defaultEntrypoint]
      : [];

  const emittedTls = emitServiceRouters(
    config,
    `router-${serviceIdentifier}`,
    { rule, service: serviceName, middlewares },
    tlsConfig,
    entryPoints,
    epTlsInfo
  );

  // Did this service's TLS config request the domain's wildcard certificate?
  return (
    emittedTls &&
    !!tlsConfig?.domains?.some(
      (d) => d.main === domain.domain && (d.sans || []).includes(`*.${domain.domain}`)
    )
  );
}

/**
 * Emit the router(s) for a service: a single un-suffixed router for zero/one
 * entrypoint, one `-<ep>`-suffixed router per entrypoint otherwise — always
 * the identical rule/service/middlewares, tls only on TLS entrypoints so
 * plain-HTTP entrypoints keep serving HTTP. Returns whether any emitted
 * router carries the tls config.
 */
function emitServiceRouters(
  config: TraefikConfig,
  baseRouterName: string,
  base: { rule: string; service: string; middlewares: string[] },
  tlsConfig: TraefikRouter["tls"],
  entryPoints: string[],
  epTlsInfo: Map<string, EntrypointTlsInfo>
): boolean {
  const shared = {
    rule: base.rule,
    service: base.service,
    ...(base.middlewares.length > 0 && { middlewares: base.middlewares }),
  };

  if (entryPoints.length === 0) {
    // Legacy: no entrypoints anywhere — single router bound to all, tls always set.
    config.http.routers[baseRouterName] = { ...shared, tls: tlsConfig };
    return true;
  }

  let emittedTls = false;
  for (const ep of entryPoints) {
    const tls = isTlsEntrypoint(ep, epTlsInfo.get(ep));
    const name =
      entryPoints.length === 1
        ? baseRouterName
        : `${baseRouterName}-${slugifyEntrypoint(ep)}`;
    config.http.routers[name] = {
      ...shared,
      entryPoints: [ep],
      ...(tls && { tls: tlsConfig }),
    };
    if (tls) emittedTls = true;
  }
  return emittedTls;
}

/**
 * Determine TLS configuration for a service based on hostname mode and certificate configs
 */
function determineTlsConfig(service: Service, domain: Domain, hostnames: string[]): TraefikRouter['tls'] {
  // If the domain uses wildcard certificates, subdomain AND apex services share
  // the wildcard cert (apex requests main=domain, sans=[*.domain]).
  if (domain.useWildcardCert && (service.hostnameMode === 'subdomain' || service.hostnameMode === 'apex')) {
    return {
      certResolver: domain.certResolver,
      domains: [
        {
          main: domain.domain,
          sans: [`*.${domain.domain}`],
        },
      ],
    };
  }

  // Check if any certificate configurations match the service hostnames
  const certificateConfigs = parseCertificateConfigs(domain.certificateConfigs);

  for (const certConfig of certificateConfigs) {
    // Check if this certificate covers any of the service hostnames
    const certDomains = [certConfig.main, ...(certConfig.sans || [])];
    const hasMatchingDomain = hostnames.some(hostname => certDomains.includes(hostname));

    if (hasMatchingDomain) {
      return {
        certResolver: certConfig.certResolver,
        domains: [
          {
            main: certConfig.main,
            sans: certConfig.sans,
          },
        ],
      };
    }
  }

  // Fallback to domain's default certificate resolver without specific domains
  // This will cause Traefik to automatically request certificates for the hostnames
  return {
    certResolver: domain.certResolver,
  };
}

/**
 * Create wildcard certificate trigger configuration for a domain
 */
function createWildcardCertTrigger(
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): void {
  // Create unique names for this domain
  const domainSafe = domain.domain.replace(/\./g, '-');
  const wildcardServiceName = `wildcard-cert-trigger-${domainSafe}`;
  const wildcardRouterName = wildcardCertRouterName(domain);
  const replacePathMiddlewareName = `wildcard-replace-path-${domainSafe}`;

  // Create middleware to replace any path with the whitepage endpoint
  config.http.middlewares![replacePathMiddlewareName] = {
    replacePath: {
      path: "/api/static/whitepage",
    },
  };

  // Create a simple service that serves the admin panel
  config.http.services[wildcardServiceName] = {
    loadBalancer: {
      servers: [
        {
          url: `http://${globalConfig.adminPanelDomain}`,
        },
      ],
    },
  };

  // Build middlewares for wildcard route
  const wildcardMiddlewares: string[] = [];

  // Add global middlewares first
  if (globalConfig.globalMiddlewares.length > 0) {
    wildcardMiddlewares.push(...globalConfig.globalMiddlewares);
  }

  // Add path replacement middleware
  wildcardMiddlewares.push(replacePathMiddlewareName);

  // Create router for the base domain to trigger wildcard cert generation.
  // Path-scoped so it can never steal real traffic from a service (e.g. an
  // apex service) whose rule matches the same Host().
  const wildcardRouter: TraefikRouter = {
    rule: `(Host(\`${domain.domain}\`)) && Path(\`${CERT_TRIGGER_PATH}\`)`,
    service: wildcardServiceName,
    ...(wildcardMiddlewares.length > 0 && { middlewares: wildcardMiddlewares }),
    ...(globalConfig.defaultEntrypoint && { entryPoints: [globalConfig.defaultEntrypoint] }),
    tls: {
      certResolver: domain.certResolver,
      domains: [
        {
          main: domain.domain,
          sans: [`*.${domain.domain}`],
        },
      ],
    },
  };
  config.http.routers[wildcardRouterName] = wildcardRouter;
}

/**
 * Create certificate triggers for specific certificate configurations
 */
function createCertificateConfigTriggers(
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): void {
  const certificateConfigs = parseCertificateConfigs(domain.certificateConfigs);
  const certRouterNames = certTriggerRouterNames(domain);

  for (const [index, certConfig] of certificateConfigs.entries()) {
    // Create unique names for this certificate config
    const certConfigSafe = `${certConfig.name.replace(/[^a-zA-Z0-9]/g, '-')}-${certConfig.main.replace(/\./g, '-')}`;
    const certServiceName = `cert-trigger-${certConfigSafe}`;
    const certRouterName = certRouterNames[index];
    const replacePathMiddlewareName = `cert-replace-path-${certConfigSafe}`;

    // Create middleware to replace any path with the whitepage endpoint
    config.http.middlewares![replacePathMiddlewareName] = {
      replacePath: {
        path: "/api/static/whitepage",
      },
    };

    // Create a simple service that serves the admin panel
    config.http.services[certServiceName] = {
      loadBalancer: {
        servers: [
          {
            url: `http://${globalConfig.adminPanelDomain}`,
          },
        ],
      },
    };

    // Build middlewares for certificate route
    const certMiddlewares: string[] = [];

    // Add global middlewares first
    if (globalConfig.globalMiddlewares.length > 0) {
      certMiddlewares.push(...globalConfig.globalMiddlewares);
    }

    // Add path replacement middleware
    certMiddlewares.push(replacePathMiddlewareName);

    // Create host rules for all domains covered by this certificate.
    // The Host() disjunction MUST be parenthesized (Traefik's && binds tighter
    // than ||) and the rule is Path-scoped so it never steals real traffic.
    const certDomains = [certConfig.main, ...(certConfig.sans || [])];
    const hostRules = certDomains.map(hostname => `Host(\`${hostname}\`)`).join(" || ");

    // Create router for the certificate domains to trigger cert generation
    const certRouter: TraefikRouter = {
      rule: `(${hostRules}) && Path(\`${CERT_TRIGGER_PATH}\`)`,
      service: certServiceName,
      ...(certMiddlewares.length > 0 && { middlewares: certMiddlewares }),
      ...(globalConfig.defaultEntrypoint && { entryPoints: [globalConfig.defaultEntrypoint] }),
      tls: {
        certResolver: certConfig.certResolver,
        domains: [
          {
            main: certConfig.main,
            sans: certConfig.sans,
          },
        ],
      },
    };
    config.http.routers[certRouterName] = certRouter;
  }
}

/**
 * Generate complete Traefik configuration
 */
export async function generateTraefikConfig(): Promise<TraefikConfig> {
  // Get enabled services with their domain information. Sorted oldest-first by
  // (createdAt, id) so identifier-collision suffixes are deterministic: the
  // older service keeps the un-suffixed router/service names across runs.
  const enabledServices = (
    await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id))
      .where(eq(services.enabled, true))
  ).sort((a, b) => {
    const ta = a.service.createdAt?.getTime?.() ?? 0;
    const tb = b.service.createdAt?.getTime?.() ?? 0;
    return ta - tb || a.service.id.localeCompare(b.service.id);
  });

  // Get all domains to ensure wildcard certificates are created even when no services are enabled
  const allDomains = await db.select().from(domains);

  const globalConfig = await getGlobalConfig();

  // Per-entrypoint TLS info (cached ~30s) — resolved once per generation.
  const epTlsInfo = await resolveEntrypointTlsInfo();

  const config: TraefikConfig = {
    http: {
      services: {},
      routers: {},
      middlewares: {},
    },
  };

  // Track unique domains for wildcard certificate generation
  const uniqueDomains = new Map<string, Domain>();
  // Identifier collisions get a service-id suffix instead of overwriting.
  const usedIdentifiers = new Set<string>();
  // Domains whose wildcard cert is already requested by a service router —
  // their wildcard trigger would be redundant (and used to steal apex traffic).
  const wildcardSatisfiedDomains = new Set<string>();

  // Process each enabled service
  for (const item of enabledServices) {
    const service = item.service;
    const domain = item.domain;

    if (!domain) {
      console.error(`Service ${service.name} has no associated domain, skipping`);
      continue;
    }

    const requestedWildcard = await createTraefikService(
      service,
      domain,
      globalConfig,
      config,
      epTlsInfo,
      usedIdentifiers
    );
    if (requestedWildcard) {
      wildcardSatisfiedDomains.add(domain.id);
    }

    // Track this domain for wildcard certificate generation
    uniqueDomains.set(domain.id, domain);
  }

  // Add ALL domains to ensure wildcard certificates are created even when no services are enabled
  for (const domain of allDomains) {
    uniqueDomains.set(domain.id, domain);
  }

  // Add certificate triggers for all domains
  for (const domain of uniqueDomains.values()) {
    // Add wildcard certificate triggers for domains that use wildcard
    // certificates — unless an enabled service already requests that wildcard.
    if (domain.useWildcardCert && !wildcardSatisfiedDomains.has(domain.id)) {
      createWildcardCertTrigger(domain, globalConfig, config);
    }

    // Add specific certificate configuration triggers
    const certificateConfigs = parseCertificateConfigs(domain.certificateConfigs);
    if (certificateConfigs.length > 0) {
      createCertificateConfigTriggers(domain, globalConfig, config);
    }
  }

  // Remove middlewares block if it's empty
  if (config.http.middlewares && Object.keys(config.http.middlewares).length === 0) {
    delete config.http.middlewares;
  }

  return config;
}