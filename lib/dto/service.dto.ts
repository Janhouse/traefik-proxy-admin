import type { Service } from "@/lib/db/schema";

// Hostname mode types
export type HostnameMode = 'subdomain' | 'apex' | 'custom';

// Request DTOs
export interface CreateServiceRequest {
  name: string;
  subdomain?: string;
  hostnameMode: HostnameMode;
  customHostnames?: string[]; // Array of hostnames for custom mode
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string;
  isHttps?: boolean;
  insecureSkipVerify?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string[];
  requestHeaders?: Record<string, string>;
}

export interface UpdateServiceRequest {
  name: string;
  subdomain?: string;
  hostnameMode: HostnameMode;
  customHostnames?: string[]; // Array of hostnames for custom mode
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string;
  isHttps?: boolean;
  insecureSkipVerify?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string[];
  requestHeaders?: Record<string, string>;
}

// Response DTOs
export interface ServiceResponse extends Service {
  parsedCustomHostnames?: string[]; // Parsed from JSON string
  parsedMiddlewares?: string[]; // Parsed from JSON string
  parsedRequestHeaders?: Record<string, string>; // Parsed from JSON string
}

// Service DTOs (internal)
export interface CreateServiceData {
  name: string;
  subdomain?: string | null;
  hostnameMode: HostnameMode;
  customHostnames?: string | null; // JSON string
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  enabled: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string | null; // JSON string
  requestHeaders?: string | null; // JSON string
}

export interface UpdateServiceData {
  name: string;
  subdomain?: string | null;
  hostnameMode: HostnameMode;
  customHostnames?: string | null; // JSON string
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  enabled: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string | null; // JSON string
  requestHeaders?: string | null; // JSON string
}