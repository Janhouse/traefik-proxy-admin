import "server-only";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGlobalConfig, type GlobalTraefikConfig } from "./app-config";
import { BasicAuthService } from "./services/basic-auth.service";
import { ServiceSecurityService } from "./services/service-security.service";
import { TRAEFIK_SESSION_COOKIE } from "./constants";
import type { Service } from "@/lib/db/schema";

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
  } catch (error) {
    // If JSON parsing fails, treat it as a plain string (single middleware)
    const trimmed = middlewares.trim();
    return trimmed ? [trimmed] : [];
  }
}

/**
 * Build middlewares array for a service with multiple security configurations
 */
async function buildServiceMiddlewares(
  service: Service,
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
        const authMiddlewareName = `auth-${securityConfig.securityType}-${service.subdomain}`;
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
            const basicAuthMiddlewareName = `basic-auth-${service.subdomain}-${securityConfig.id.substring(0, 8)}`;
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
        const headersMiddlewareName = `headers-${service.subdomain}`;
        config.http.middlewares![headersMiddlewareName] = {
          headers: {
            customRequestHeaders: headers,
          },
        };
        middlewares.push(headersMiddlewareName);
      }
    } catch (error) {
      console.warn(`Failed to parse request headers for service ${service.subdomain}:`, error);
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
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): Promise<void> {
  const serviceName = `service-${service.subdomain}`;
  const routerName = `router-${service.subdomain}`;
  const protocol = service.isHttps ? "https" : "http";

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
    const transportName = `insecure-transport-${service.subdomain}`;
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
  const middlewares = await buildServiceMiddlewares(service, globalConfig, config);

  // Router configuration
  const fullDomain = `${service.subdomain}.${globalConfig.baseDomain}`;
  const router: TraefikRouter = {
    rule: `Host(\`${fullDomain}\`)`,
    service: serviceName,
    ...(middlewares.length > 0 && { middlewares }),
    ...(globalConfig.defaultEntrypoint && { entryPoints: [globalConfig.defaultEntrypoint] }),
    tls: {
      certResolver: globalConfig.certResolver,
      domains: [
        {
          main: globalConfig.baseDomain,
          sans: [`*.${globalConfig.baseDomain}`],
        },
      ],
    },
  };
  config.http.routers[routerName] = router;
}

/**
 * Create wildcard certificate trigger configuration
 */
function createWildcardCertTrigger(
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): void {
  const wildcardServiceName = "wildcard-cert-trigger";
  const wildcardRouterName = "wildcard-cert-router";
  const replacePathMiddlewareName = "wildcard-replace-path";

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
    rule: `Host(\`${globalConfig.baseDomain}\`)`,
    service: wildcardServiceName,
    ...(wildcardMiddlewares.length > 0 && { middlewares: wildcardMiddlewares }),
    ...(globalConfig.defaultEntrypoint && { entryPoints: [globalConfig.defaultEntrypoint] }),
    tls: {
      certResolver: globalConfig.certResolver,
      domains: [
        {
          main: globalConfig.baseDomain,
          sans: [`*.${globalConfig.baseDomain}`],
        },
      ],
    },
  };
  config.http.routers[wildcardRouterName] = wildcardRouter;
}

/**
 * Generate complete Traefik configuration
 */
export async function generateTraefikConfig(): Promise<TraefikConfig> {
  const enabledServices = await db
    .select()
    .from(services)
    .where(eq(services.enabled, true));

  const globalConfig = await getGlobalConfig();

  const config: TraefikConfig = {
    http: {
      services: {},
      routers: {},
      middlewares: {},
    },
  };

  // Process each enabled service
  for (const service of enabledServices) {
    await createTraefikService(service, globalConfig, config);
  }

  // Add wildcard certificate trigger if base domain is configured
  if (globalConfig.baseDomain) {
    createWildcardCertTrigger(globalConfig, config);
  }

  // Remove middlewares block if it's empty
  if (config.http.middlewares && Object.keys(config.http.middlewares).length === 0) {
    delete config.http.middlewares;
  }

  return config;
}