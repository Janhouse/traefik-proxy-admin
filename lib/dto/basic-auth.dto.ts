import type { BasicAuthConfig, BasicAuthUser } from "@/lib/db/schema";

// Request DTOs
export interface CreateBasicAuthConfigRequest {
  name: string;
  description?: string;
}

export interface UpdateBasicAuthConfigRequest {
  name: string;
  description?: string;
}

export interface CreateBasicAuthUserRequest {
  username: string;
  password: string;
}

export interface UpdateBasicAuthUserRequest {
  username: string;
  password?: string;
}

// Response DTOs
export interface BasicAuthConfigResponse extends BasicAuthConfig {
  users?: BasicAuthUserResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BasicAuthUserResponse extends Omit<BasicAuthUser, "passwordHash"> {
  // Exclude password hash for security
}

// Service DTOs (internal)
export interface CreateBasicAuthConfigData {
  name: string;
  description?: string | null;
}

export interface UpdateBasicAuthConfigData {
  name: string;
  description?: string | null;
}

export interface CreateBasicAuthUserData {
  configId: string;
  username: string;
  passwordHash: string;
}

export interface UpdateBasicAuthUserData {
  username: string;
  passwordHash?: string;
}