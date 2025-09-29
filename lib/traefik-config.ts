import "server-only";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";
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
 * Generate service identifier based on hostname mode
 */
function generateServiceIdentifier(service: Service, domain: Domain): string {
  switch (service.hostnameMode) {
    case 'subdomain':
      return service.subdomain || 'default';
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
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): Promise<string[]> {
  const middlewares: string[] = [];
  const serviceIdentifier = generateServiceIdentifier(service, domain);

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
      const headers = JSON.parse(service.requestHeaders);
      if (headers && Object.keys(headers).length > 0) {
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
 * Create Traefik service configuration for a single service
 */
async function createTraefikService(
  service: Service,
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): Promise<void> {
  const serviceIdentifier = generateServiceIdentifier(service, domain);
  const serviceName = `service-${serviceIdentifier}`;
  const routerName = `router-${serviceIdentifier}`;
  const protocol = service.isHttps ? "https" : "http";

  // Get hostnames for this service
  const hostnames = generateServiceHostnames(service, domain);
  if (hostnames.length === 0) {
    console.warn(`Service ${service.id} has no valid hostnames, skipping`);
    return;
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

  // Build middlewares
  const middlewares = await buildServiceMiddlewares(service, domain, globalConfig, config);

  // Create router rule for multiple hostnames
  const hostRules = hostnames.map(hostname => `Host(\`${hostname}\`)`).join(" || ");

  // Determine certificate configuration
  const tlsConfig = determineTlsConfig(service, domain, hostnames);

  // Determine which entrypoint to use (service-specific or default)
  const entrypoint = service.entrypoint || globalConfig.defaultEntrypoint;

  // Router configuration
  const router: TraefikRouter = {
    rule: hostRules,
    service: serviceName,
    ...(middlewares.length > 0 && { middlewares }),
    ...(entrypoint && { entryPoints: [entrypoint] }),
    tls: tlsConfig,
  };
  config.http.routers[routerName] = router;
}

/**
 * Determine TLS configuration for a service based on hostname mode and certificate configs
 */
function determineTlsConfig(service: Service, domain: Domain, hostnames: string[]): TraefikRouter['tls'] {
  // If domain uses wildcard certificates and service is in subdomain mode, use wildcard
  if (domain.useWildcardCert && service.hostnameMode === 'subdomain') {
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
  const wildcardRouterName = `wildcard-cert-router-${domainSafe}`;
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

  // Create router for the base domain to trigger wildcard cert generation
  const wildcardRouter: TraefikRouter = {
    rule: `Host(\`${domain.domain}\`)`,
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

  for (const certConfig of certificateConfigs) {
    // Create unique names for this certificate config
    const certConfigSafe = `${certConfig.name.replace(/[^a-zA-Z0-9]/g, '-')}-${certConfig.main.replace(/\./g, '-')}`;
    const certServiceName = `cert-trigger-${certConfigSafe}`;
    const certRouterName = `cert-router-${certConfigSafe}`;
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

    // Create host rules for all domains covered by this certificate
    const certDomains = [certConfig.main, ...(certConfig.sans || [])];
    const hostRules = certDomains.map(hostname => `Host(\`${hostname}\`)`).join(" || ");

    // Create router for the certificate domains to trigger cert generation
    const certRouter: TraefikRouter = {
      rule: hostRules,
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
  // Get enabled services with their domain information
  const enabledServices = await db
    .select({
      service: services,
      domain: domains,
    })
    .from(services)
    .leftJoin(domains, eq(services.domainId, domains.id))
    .where(eq(services.enabled, true));

  // Get all domains to ensure wildcard certificates are created even when no services are enabled
  const allDomains = await db.select().from(domains);

  const globalConfig = await getGlobalConfig();

  const config: TraefikConfig = {
    http: {
      services: {},
      routers: {},
      middlewares: {},
    },
  };

  // Track unique domains for wildcard certificate generation
  const uniqueDomains = new Map<string, Domain>();

  // Process each enabled service
  for (const item of enabledServices) {
    const service = item.service;
    const domain = item.domain;

    if (!domain) {
      console.error(`Service ${service.name} has no associated domain, skipping`);
      continue;
    }

    await createTraefikService(service, domain, globalConfig, config);

    // Track this domain for wildcard certificate generation
    uniqueDomains.set(domain.id, domain);
  }

  // Add ALL domains to ensure wildcard certificates are created even when no services are enabled
  for (const domain of allDomains) {
    uniqueDomains.set(domain.id, domain);
  }

  // Add certificate triggers for all domains
  for (const domain of uniqueDomains.values()) {
    // Add wildcard certificate triggers for domains that use wildcard certificates
    if (domain.useWildcardCert) {
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