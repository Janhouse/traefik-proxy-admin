import type { Domain } from "@/lib/db/schema";

// Certificate configuration types
export interface CertificateConfig {
  name: string;
  main: string;
  sans?: string[];
  certResolver: string;
}

// Request DTOs
export interface CreateDomainRequest {
  name: string;
  domain: string;
  description?: string;
  useWildcardCert?: boolean;
  certResolver?: string;
  certificateConfigs?: CertificateConfig[];
  isDefault?: boolean;
}

export interface UpdateDomainRequest {
  name: string;
  domain: string;
  description?: string;
  useWildcardCert?: boolean;
  certResolver?: string;
  certificateConfigs?: CertificateConfig[];
  isDefault?: boolean;
}

// Response DTOs
export interface DomainResponse extends Domain {
  serviceCount?: number;
  parsedCertificateConfigs?: CertificateConfig[];
}

// Service DTOs (internal)
export interface CreateDomainData {
  name: string;
  domain: string;
  description?: string | null;
  useWildcardCert: boolean;
  certResolver: string;
  certificateConfigs?: string | null; // JSON string
  isDefault: boolean;
}

export interface UpdateDomainData {
  name: string;
  domain: string;
  description?: string | null;
  useWildcardCert: boolean;
  certResolver: string;
  certificateConfigs?: string | null; // JSON string
  isDefault: boolean;
}