import "server-only";
import { db, services, serviceSecurityConfigs } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type {
  ServiceSecurityConfigResponse,
  ServiceWithSecurityResponse,
  CreateServiceSecurityConfigRequest,
  UpdateServiceSecurityConfigRequest,
  SecurityConfig,
} from "@/lib/dto/service-security.dto";
import type { HostnameMode } from "@/lib/dto/service.dto";
import { parseSecurityConfig, parseSecurityConfigWithId } from "@/lib/dto/service-security.dto";
import type { ServiceSecurityConfig } from "@/lib/db/schema";

export class ServiceSecurityService {

  // Get all security configurations for a service
  static async getServiceSecurityConfigs(serviceId: string): Promise<SecurityConfig[]> {
    const configs = await db
      .select()
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.serviceId, serviceId))
      .orderBy(serviceSecurityConfigs.priority);

    return configs.map(config => parseSecurityConfig(config));
  }

  // Get all security configurations for a service with IDs
  static async getServiceSecurityConfigsWithIds(serviceId: string): Promise<(SecurityConfig & { id: string })[]> {
    const configs = await db
      .select()
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.serviceId, serviceId))
      .orderBy(serviceSecurityConfigs.priority);

    return configs.map(config => parseSecurityConfigWithId(config));
  }

  // Get a specific security configuration
  static async getSecurityConfigById(configId: string): Promise<ServiceSecurityConfigResponse | null> {
    const configs = await db
      .select()
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.id, configId));

    if (configs.length === 0) {
      return null;
    }

    const config = configs[0];
    return {
      ...config,
      parsedConfig: JSON.parse(config.config),
    };
  }

  // Create a new security configuration for a service
  static async createSecurityConfig(data: CreateServiceSecurityConfigRequest): Promise<ServiceSecurityConfig> {
    // Check if service exists
    const serviceExists = await this.serviceExists(data.serviceId);
    if (!serviceExists) {
      throw new Error("Service not found");
    }

    const configData = {
      serviceId: data.serviceId,
      securityType: data.securityType,
      isEnabled: data.isEnabled ?? true,
      priority: data.priority ?? 0,
      config: JSON.stringify(data.config),
    };

    const result = await db
      .insert(serviceSecurityConfigs)
      .values(configData)
      .returning();

    return result[0];
  }

  // Update an existing security configuration
  static async updateSecurityConfig(
    configId: string,
    data: UpdateServiceSecurityConfigRequest
  ): Promise<ServiceSecurityConfig> {
    const updateData: Partial<ServiceSecurityConfig> = {
      updatedAt: new Date(),
    };

    if (data.isEnabled !== undefined) {
      updateData.isEnabled = data.isEnabled;
    }

    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }

    if (data.config !== undefined) {
      updateData.config = JSON.stringify(data.config);
    }

    const result = await db
      .update(serviceSecurityConfigs)
      .set(updateData)
      .where(eq(serviceSecurityConfigs.id, configId))
      .returning();

    if (result.length === 0) {
      throw new Error("Security configuration not found");
    }

    return result[0];
  }

  // Delete a security configuration
  static async deleteSecurityConfig(configId: string): Promise<void> {
    const result = await db
      .delete(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.id, configId))
      .returning();

    if (result.length === 0) {
      throw new Error("Security configuration not found");
    }
  }

  // Get a service with all its security configurations
  static async getServiceWithSecurity(serviceId: string): Promise<ServiceWithSecurityResponse | null> {
    const serviceResult = await db
      .select()
      .from(services)
      .where(eq(services.id, serviceId));

    if (serviceResult.length === 0) {
      return null;
    }

    const service = serviceResult[0];
    const securityConfigs = await this.getServiceSecurityConfigs(serviceId);

    return {
      ...service,
      hostnameMode: service.hostnameMode as HostnameMode,
      enabledAt: service.enabledAt?.toISOString(),
      middlewares: service.middlewares ?? undefined,
      securityConfigs,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  }

  // Get all services with their security configurations
  static async getAllServicesWithSecurity(): Promise<ServiceWithSecurityResponse[]> {
    const allServices = await db.select().from(services);

    const servicesWithSecurity = await Promise.all(
      allServices.map(async (service) => {
        const securityConfigs = await this.getServiceSecurityConfigs(service.id);

        return {
          ...service,
          hostnameMode: service.hostnameMode as HostnameMode,
          enabledAt: service.enabledAt?.toISOString(),
          middlewares: service.middlewares ?? undefined,
          securityConfigs,
          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),
        };
      })
    );

    return servicesWithSecurity;
  }

  // Enable/disable a security configuration
  static async toggleSecurityConfig(configId: string): Promise<ServiceSecurityConfig> {
    const currentConfigs = await db
      .select()
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.id, configId));

    if (currentConfigs.length === 0) {
      throw new Error("Security configuration not found");
    }

    const currentConfig = currentConfigs[0];
    const result = await db
      .update(serviceSecurityConfigs)
      .set({
        isEnabled: !currentConfig.isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(serviceSecurityConfigs.id, configId))
      .returning();

    return result[0];
  }

  // Update the priority of multiple security configurations
  static async updateSecurityConfigPriorities(
    updates: Array<{ configId: string; priority: number }>
  ): Promise<void> {
    await Promise.all(
      updates.map(({ configId, priority }) =>
        db
          .update(serviceSecurityConfigs)
          .set({
            priority,
            updatedAt: new Date()
          })
          .where(eq(serviceSecurityConfigs.id, configId))
      )
    );
  }

  // Get security configurations by type across all services
  static async getSecurityConfigsByType(securityType: string): Promise<ServiceSecurityConfig[]> {
    return await db
      .select()
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.securityType, securityType))
      .orderBy(serviceSecurityConfigs.priority);
  }

  // Utility methods
  private static async serviceExists(serviceId: string): Promise<boolean> {
    const result = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, serviceId));

    return result.length > 0;
  }

  static async securityConfigExists(configId: string): Promise<boolean> {
    const result = await db
      .select({ id: serviceSecurityConfigs.id })
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.id, configId));

    return result.length > 0;
  }

  // Get enabled security configurations for Traefik config generation
  static async getEnabledSecurityConfigsForService(serviceId: string): Promise<ServiceSecurityConfig[]> {
    return await db
      .select()
      .from(serviceSecurityConfigs)
      .where(
        and(
          eq(serviceSecurityConfigs.serviceId, serviceId),
          eq(serviceSecurityConfigs.isEnabled, true)
        )
      )
      .orderBy(serviceSecurityConfigs.priority);
  }
}