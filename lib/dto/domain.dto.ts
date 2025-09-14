import type { Domain } from "@/lib/db/schema";

// Request DTOs
export interface CreateDomainRequest {
  name: string;
  domain: string;
  description?: string;
  useWildcardCert?: boolean;
  certResolver?: string;
  isDefault?: boolean;
}

export interface UpdateDomainRequest {
  name: string;
  domain: string;
  description?: string;
  useWildcardCert?: boolean;
  certResolver?: string;
  isDefault?: boolean;
}

// Response DTOs
export interface DomainResponse extends Domain {
  serviceCount?: number;
}

// Service DTOs (internal)
export interface CreateDomainData {
  name: string;
  domain: string;
  description?: string | null;
  useWildcardCert: boolean;
  certResolver: string;
  isDefault: boolean;
}

export interface UpdateDomainData {
  name: string;
  domain: string;
  description?: string | null;
  useWildcardCert: boolean;
  certResolver: string;
  isDefault: boolean;
}