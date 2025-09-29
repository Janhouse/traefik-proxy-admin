import "server-only";
import { db, domains, services } from "@/lib/db";
import { eq, count } from "drizzle-orm";
import type {
  DomainResponse,
  CreateDomainData,
  UpdateDomainData,
  CertificateConfig,
} from "@/lib/dto/domain.dto";
import type { Domain } from "@/lib/db/schema";

export class DomainService {
  // Helper method to parse certificate configs from JSON string
  private static parseCertificateConfigs(certificateConfigs: string | null): CertificateConfig[] {
    if (!certificateConfigs) return [];

    try {
      const parsed = JSON.parse(certificateConfigs);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Failed to parse certificate configs:", error);
      return [];
    }
  }

  static async getAllDomains(): Promise<DomainResponse[]> {
    const allDomains = await db.select().from(domains);

    // Fetch service count for each domain
    const domainsWithServiceCount = await Promise.all(
      allDomains.map(async (domain) => {
        const serviceCountResult = await db
          .select({ count: count() })
          .from(services)
          .where(eq(services.domainId, domain.id));

        return {
          ...domain,
          serviceCount: serviceCountResult[0]?.count || 0,
          parsedCertificateConfigs: this.parseCertificateConfigs(domain.certificateConfigs),
        };
      })
    );

    return domainsWithServiceCount;
  }

  static async getDomainById(id: string): Promise<DomainResponse | null> {
    const result = await db
      .select()
      .from(domains)
      .where(eq(domains.id, id));

    if (result.length === 0) {
      return null;
    }

    const domain = result[0];

    // Get service count
    const serviceCountResult = await db
      .select({ count: count() })
      .from(services)
      .where(eq(services.domainId, domain.id));

    return {
      ...domain,
      serviceCount: serviceCountResult[0]?.count || 0,
      parsedCertificateConfigs: this.parseCertificateConfigs(domain.certificateConfigs),
    };
  }

  static async createDomain(data: CreateDomainData): Promise<Domain> {
    // Check if domain already exists
    const existing = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, data.domain));

    if (existing.length > 0) {
      throw new Error("Domain already exists");
    }

    // If this domain is set as default, unset other defaults
    if (data.isDefault) {
      await db
        .update(domains)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(domains.isDefault, true));
    }

    const result = await db
      .insert(domains)
      .values({
        ...data,
        certificateConfigs: data.certificateConfigs && data.certificateConfigs.length > 0
          ? JSON.stringify(data.certificateConfigs)
          : null,
      })
      .returning();

    return result[0];
  }

  static async updateDomain(id: string, data: UpdateDomainData): Promise<Domain> {
    // Check if domain already exists (excluding current domain)
    const existing = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, data.domain));

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error("Domain already exists");
    }

    // If this domain is set as default, unset other defaults
    if (data.isDefault) {
      await db
        .update(domains)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(domains.isDefault, true));
    }

    const result = await db
      .update(domains)
      .set({
        ...data,
        certificateConfigs: data.certificateConfigs && data.certificateConfigs.length > 0
          ? JSON.stringify(data.certificateConfigs)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Domain not found");
    }

    return result[0];
  }

  static async deleteDomain(id: string): Promise<void> {
    // Check if domain has any services
    const serviceCount = await db
      .select({ count: count() })
      .from(services)
      .where(eq(services.domainId, id));

    if (serviceCount[0]?.count > 0) {
      throw new Error("Cannot delete domain with existing services");
    }

    const result = await db
      .delete(domains)
      .where(eq(domains.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Domain not found");
    }
  }

  static async domainExists(id: string): Promise<boolean> {
    const result = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, id));

    return result.length > 0;
  }

  static async getDefaultDomain(): Promise<Domain | null> {
    const result = await db
      .select()
      .from(domains)
      .where(eq(domains.isDefault, true));

    return result.length > 0 ? result[0] : null;
  }

  static async ensureDefaultDomain(): Promise<Domain | null> {
    const defaultDomain = await this.getDefaultDomain();

    if (!defaultDomain) {
      // If no default domain exists, make the first domain default
      const firstDomain = await db.select().from(domains).limit(1);
      if (firstDomain.length > 0) {
        const updated = await db
          .update(domains)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(domains.id, firstDomain[0].id))
          .returning();
        return updated[0];
      }
    }

    return defaultDomain;
  }
}