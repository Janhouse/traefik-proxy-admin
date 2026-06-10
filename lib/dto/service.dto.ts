import type { RuleNode } from "@/lib/route-rule";

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
  entrypoints?: string[];
  matchRules?: RuleNode[];
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
  entrypoints?: string[];
  matchRules?: RuleNode[];
  isHttps?: boolean;
  insecureSkipVerify?: boolean;
  enabled?: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string[];
  requestHeaders?: Record<string, string>;
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
  entrypoints?: string | null; // JSON string
  matchRules?: string | null; // JSON string
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
  entrypoints?: string | null; // JSON string
  matchRules?: string | null; // JSON string
  isHttps: boolean;
  insecureSkipVerify: boolean;
  enabled: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string | null; // JSON string
  requestHeaders?: string | null; // JSON string
}