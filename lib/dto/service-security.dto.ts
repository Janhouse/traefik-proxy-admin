import type { ServiceSecurityConfig } from "@/lib/db/schema";

// Security configuration types
export type SecurityType = 'shared_link' | 'sso' | 'basic_auth';

// Base security configuration interface
export interface BaseSecurityConfig {
  type: SecurityType;
  isEnabled: boolean;
  priority: number;
}

// Specific configuration interfaces
export interface SharedLinkConfig extends BaseSecurityConfig {
  type: 'shared_link';
  config: {
    expiresInHours: number;
    sessionDurationMinutes: number;
  };
}

export interface SSOConfig extends BaseSecurityConfig {
  type: 'sso';
  config: {
    groups: string[];
    users: string[];
  };
}

export interface BasicAuthConfig extends BaseSecurityConfig {
  type: 'basic_auth';
  config: {
    basicAuthConfigId: string;
  };
}

// Union type for all security configurations
export type SecurityConfig = SharedLinkConfig | SSOConfig | BasicAuthConfig;

// Request DTOs
export interface CreateServiceSecurityConfigRequest {
  serviceId: string;
  securityType: SecurityType;
  isEnabled?: boolean;
  priority?: number;
  config: Record<string, any>;
}

export interface UpdateServiceSecurityConfigRequest {
  isEnabled?: boolean;
  priority?: number;
  config?: Record<string, any>;
}

// Response DTOs
export interface ServiceSecurityConfigResponse extends ServiceSecurityConfig {
  parsedConfig: Record<string, any>;
}

export interface ServiceWithSecurityResponse {
  id: string;
  name: string;
  subdomain: string;
  targetIp: string;
  targetPort: number;
  isHttps: boolean;
  enabled: boolean;
  enabledAt?: string;
  enableDurationMinutes?: number | null;
  middlewares?: string;
  securityConfigs: SecurityConfig[];
  createdAt: string;
  updatedAt: string;
}

// Service DTOs (updated)
export interface CreateServiceRequest {
  name: string;
  subdomain: string;
  targetIp: string;
  targetPort: number;
  isHttps?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string;
  securityConfigs?: CreateServiceSecurityConfigRequest[];
}

export interface UpdateServiceRequest {
  name?: string;
  subdomain?: string;
  targetIp?: string;
  targetPort?: number;
  isHttps?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string;
}

// Validation helpers
export function parseSecurityConfig(securityConfig: ServiceSecurityConfig): SecurityConfig {
  const baseConfig = {
    type: securityConfig.securityType as SecurityType,
    isEnabled: securityConfig.isEnabled,
    priority: securityConfig.priority,
  };

  const parsedConfig = JSON.parse(securityConfig.config);

  switch (securityConfig.securityType) {
    case 'shared_link':
      return {
        ...baseConfig,
        type: 'shared_link',
        config: {
          expiresInHours: parsedConfig.expiresInHours || 24,
          sessionDurationMinutes: parsedConfig.sessionDurationMinutes || 60,
        },
      } as SharedLinkConfig;

    case 'sso':
      return {
        ...baseConfig,
        type: 'sso',
        config: {
          groups: parsedConfig.groups || [],
          users: parsedConfig.users || [],
        },
      } as SSOConfig;

    case 'basic_auth':
      return {
        ...baseConfig,
        type: 'basic_auth',
        config: {
          basicAuthConfigId: parsedConfig.basicAuthConfigId,
        },
      } as BasicAuthConfig;

    default:
      throw new Error(`Unknown security type: ${securityConfig.securityType}`);
  }
}

export function parseSecurityConfigWithId(securityConfig: ServiceSecurityConfig): SecurityConfig & { id: string } {
  const baseConfig = {
    id: securityConfig.id,
    type: securityConfig.securityType as SecurityType,
    isEnabled: securityConfig.isEnabled,
    priority: securityConfig.priority,
  };

  const parsedConfig = JSON.parse(securityConfig.config);

  switch (securityConfig.securityType) {
    case 'shared_link':
      return {
        ...baseConfig,
        type: 'shared_link',
        config: {
          expiresInHours: parsedConfig.expiresInHours || 24,
          sessionDurationMinutes: parsedConfig.sessionDurationMinutes || 60,
        },
      } as SharedLinkConfig & { id: string };

    case 'sso':
      return {
        ...baseConfig,
        type: 'sso',
        config: {
          groups: parsedConfig.groups || [],
          users: parsedConfig.users || [],
        },
      } as SSOConfig & { id: string };

    case 'basic_auth':
      return {
        ...baseConfig,
        type: 'basic_auth',
        config: {
          basicAuthConfigId: parsedConfig.basicAuthConfigId,
        },
      } as BasicAuthConfig & { id: string };

    default:
      throw new Error(`Unknown security type: ${securityConfig.securityType}`);
  }
}