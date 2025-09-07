import "server-only";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGlobalConfig } from "./app-config";
import { TRAEFIK_SESSION_COOKIE } from "./constants";

export interface TraefikService {
  loadBalancer: {
    servers: Array<{
      url: string;
    }>;
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
  [key: string]: unknown; // Allow for custom middleware configurations
}

export interface TraefikConfig {
  http: {
    services: Record<string, TraefikService>;
    routers: Record<string, TraefikRouter>;
    middlewares?: Record<string, TraefikMiddleware>;
  };
}

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

  for (const service of enabledServices) {
    const serviceName = `service-${service.subdomain}`;
    const routerName = `router-${service.subdomain}`;
    const protocol = service.isHttps ? "https" : "http";
    
    // Service configuration
    config.http.services[serviceName] = {
      loadBalancer: {
        servers: [
          {
            url: `${protocol}://${service.targetIp}:${service.targetPort}`,
          },
        ],
      },
    };

    const middlewares: string[] = [];

    // Add global middlewares first
    if (globalConfig.globalMiddlewares.length > 0) {
      middlewares.push(...globalConfig.globalMiddlewares);
    }

    // Add auth middleware if needed
    if (service.authMethod === "shared_link" || service.authMethod === "sso") {
      const authMiddlewareName = `auth-${service.subdomain}`;
      config.http.middlewares![authMiddlewareName] = {
        forwardAuth: {
          address: `http://${globalConfig.adminPanelDomain}/api/auth/verify?serviceId=${service.id}`,
          trustForwardHeader: true,
          addAuthCookiesToResponse: [TRAEFIK_SESSION_COOKIE],
          authRequestHeaders: ["Accept", "Cookie", "X-Forwarded-Proto", "X-Forwarded-Host", "X-Forwarded-Uri"],
        },
      };
      middlewares.push(authMiddlewareName);
    }


    // Add service-specific middlewares
    if (service.middlewares) {
      try {
        const serviceMiddlewares = JSON.parse(service.middlewares) as string[];
        middlewares.push(...serviceMiddlewares);
      } catch (error) {
        console.error(`Error parsing middlewares for service ${service.subdomain}:`, error);
      }
    }

    // Router configuration with configurable domain and cert resolver
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

  // Add a wildcard certificate trigger route for the base domain
  // This ensures the wildcard certificate is requested and available for all services
  if (globalConfig.baseDomain) {
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

  // Remove middlewares block if it's empty
  if (config.http.middlewares && Object.keys(config.http.middlewares).length === 0) {
    delete config.http.middlewares;
  }

  return config;
}