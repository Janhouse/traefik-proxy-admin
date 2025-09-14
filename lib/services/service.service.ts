import "server-only";
import { db, services, serviceSecurityConfigs, domains, NewService } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkAndDisableExpiredServices } from "@/lib/service-scheduler";
import type { Service } from "@/components/service-table";

export interface ServiceWithDomainAndSecurity extends Service {
  hasSharedLink: boolean;
  hasSso: boolean;
  hasBasicAuth: boolean;
  basicAuthCount: number;
}

export class ServiceService {
  static async getAllServices(): Promise<ServiceWithDomainAndSecurity[]> {
    // Check and disable any expired services before returning the list
    const disabledCount = await checkAndDisableExpiredServices();
    if (disabledCount > 0) {
      console.log(`Service: Auto-disabled ${disabledCount} expired service(s)`);
    }

    // Get services with domain information
    const allServices = await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id));

    // Get security configuration counts for each service
    const servicesWithSecurity = await Promise.all(
      allServices.map(async (item) => {
        const service = item.service;
        const domain = item.domain;

        // Get security config counts
        const securityConfigs = await db
          .select({
            securityType: serviceSecurityConfigs.securityType
          })
          .from(serviceSecurityConfigs)
          .where(eq(serviceSecurityConfigs.serviceId, service.id));

        const hasSharedLink = securityConfigs.some(config => config.securityType === 'shared_link');
        const hasSso = securityConfigs.some(config => config.securityType === 'sso');
        const hasBasicAuth = securityConfigs.some(config => config.securityType === 'basic_auth');
        const basicAuthCount = securityConfigs.filter(config => config.securityType === 'basic_auth').length;

        return {
          ...service,
          enabledAt: service.enabledAt?.toISOString() || undefined,
          enableDurationMinutes: service.enableDurationMinutes || undefined,
          middlewares: service.middlewares || undefined,
          requestHeaders: service.requestHeaders || undefined,
          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),
          domain: domain || undefined,
          hasSharedLink,
          hasSso,
          hasBasicAuth,
          basicAuthCount,
        };
      })
    );

    return servicesWithSecurity;
  }

  static async createService(serviceData: NewService) {
    const [service] = await db.insert(services).values(serviceData).returning();
    return service;
  }

  static async getServiceById(id: string) {
    const result = await db
      .select()
      .from(services)
      .where(eq(services.id, id));

    return result.length > 0 ? result[0] : null;
  }

  static async getServiceByIdWithDomain(id: string): Promise<ServiceWithDomainAndSecurity | null> {
    const result = await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id))
      .where(eq(services.id, id));

    if (result.length === 0) {
      return null;
    }

    const item = result[0];
    const service = item.service;
    const domain = item.domain;

    // Get security config counts
    const securityConfigs = await db
      .select({
        securityType: serviceSecurityConfigs.securityType
      })
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.serviceId, service.id));

    const hasSharedLink = securityConfigs.some(config => config.securityType === 'shared_link');
    const hasSso = securityConfigs.some(config => config.securityType === 'sso');
    const hasBasicAuth = securityConfigs.some(config => config.securityType === 'basic_auth');
    const basicAuthCount = securityConfigs.filter(config => config.securityType === 'basic_auth').length;

    return {
      ...service,
      enabledAt: service.enabledAt?.toISOString() || undefined,
      enableDurationMinutes: service.enableDurationMinutes || undefined,
      middlewares: service.middlewares || undefined,
      requestHeaders: service.requestHeaders || undefined,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
      domain: domain || undefined,
      hasSharedLink,
      hasSso,
      hasBasicAuth,
      basicAuthCount,
    };
  }

  static async updateService(id: string, serviceData: Partial<NewService> | Record<string, unknown>) {
    const [service] = await db
      .update(services)
      .set({
        ...serviceData,
        updatedAt: new Date(),
      })
      .where(eq(services.id, id))
      .returning();

    return service;
  }

  static async deleteService(id: string) {
    await db.delete(services).where(eq(services.id, id));
  }

  static async toggleService(id: string, enabled?: boolean, durationMinutes?: number) {
    // Get current service state if enabled is not specified
    const currentService = await this.getServiceById(id);
    if (!currentService) {
      return null;
    }

    const newEnabledState = enabled !== undefined ? enabled : !currentService.enabled;
    const updateData: Partial<NewService> = {
      enabled: newEnabledState,
    };

    // If enabling the service, set enabledAt and duration
    if (newEnabledState) {
      updateData.enabledAt = new Date();

      // Use provided duration, or keep the service's existing duration (including null for infinite)
      if (durationMinutes !== undefined) {
        updateData.enableDurationMinutes = durationMinutes;
      }
      // Otherwise keep the existing service duration (null = infinite, number = finite)
    }

    const [service] = await db
      .update(services)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(services.id, id))
      .returning();

    return service;
  }
}