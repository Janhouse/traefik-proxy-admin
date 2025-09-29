import "server-only";
import { db, basicAuthConfigs, basicAuthUsers } from "@/lib/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type {
  BasicAuthConfigResponse,
  BasicAuthUserResponse,
  CreateBasicAuthConfigData,
  UpdateBasicAuthConfigData,
  CreateBasicAuthUserData,
  UpdateBasicAuthUserData,
} from "@/lib/dto/basic-auth.dto";
import type { BasicAuthConfig, BasicAuthUser } from "@/lib/db/schema";

export class BasicAuthService {
  // Config operations
  static async getAllConfigs(): Promise<BasicAuthConfigResponse[]> {
    const configs = await db.select().from(basicAuthConfigs);

    // Fetch users for each config
    const configsWithUsers = await Promise.all(
      configs.map(async (config) => {
        const users = await this.getUsersByConfigId(config.id);
        return {
          ...config,
          users,
        };
      })
    );

    return configsWithUsers;
  }

  static async getConfigById(id: string): Promise<BasicAuthConfigResponse | null> {
    const configs = await db
      .select()
      .from(basicAuthConfigs)
      .where(eq(basicAuthConfigs.id, id));

    if (configs.length === 0) {
      return null;
    }

    const users = await this.getUsersByConfigId(id);

    return {
      ...configs[0],
      users,
    };
  }

  static async createConfig(data: CreateBasicAuthConfigData): Promise<BasicAuthConfig> {
    // Check if name already exists
    const existing = await db
      .select()
      .from(basicAuthConfigs)
      .where(eq(basicAuthConfigs.name, data.name));

    if (existing.length > 0) {
      throw new Error("Configuration name already exists");
    }

    const result = await db
      .insert(basicAuthConfigs)
      .values(data)
      .returning();

    return result[0];
  }

  static async updateConfig(id: string, data: UpdateBasicAuthConfigData): Promise<BasicAuthConfig> {
    // Check if name already exists (excluding current config)
    const existing = await db
      .select()
      .from(basicAuthConfigs)
      .where(eq(basicAuthConfigs.name, data.name));

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error("Configuration name already exists");
    }

    const result = await db
      .update(basicAuthConfigs)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(basicAuthConfigs.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Configuration not found");
    }

    return result[0];
  }

  static async deleteConfig(id: string): Promise<void> {
    const result = await db
      .delete(basicAuthConfigs)
      .where(eq(basicAuthConfigs.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Configuration not found");
    }
  }

  static async configExists(id: string): Promise<boolean> {
    const configs = await db
      .select({ id: basicAuthConfigs.id })
      .from(basicAuthConfigs)
      .where(eq(basicAuthConfigs.id, id));

    return configs.length > 0;
  }

  // User operations
  static async getUsersByConfigId(configId: string): Promise<BasicAuthUserResponse[]> {
    const users = await db
      .select()
      .from(basicAuthUsers)
      .where(eq(basicAuthUsers.configId, configId));

    // Remove password hash from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return users.map(({ passwordHash: _, ...user }) => user);
  }

  static async getUserById(id: string): Promise<BasicAuthUserResponse | null> {
    const users = await db
      .select()
      .from(basicAuthUsers)
      .where(eq(basicAuthUsers.id, id));

    if (users.length === 0) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...user } = users[0];
    return user;
  }

  static async createUser(data: CreateBasicAuthUserData): Promise<BasicAuthUser> {
    // Check if config exists
    const configExists = await this.configExists(data.configId);
    if (!configExists) {
      throw new Error("Configuration not found");
    }

    // Check if username already exists in this config
    const existing = await db
      .select()
      .from(basicAuthUsers)
      .where(eq(basicAuthUsers.configId, data.configId));

    if (existing.some(user => user.username === data.username)) {
      throw new Error("Username already exists in this configuration");
    }

    const result = await db
      .insert(basicAuthUsers)
      .values(data)
      .returning();

    return result[0];
  }

  static async updateUser(id: string, data: UpdateBasicAuthUserData): Promise<BasicAuthUser> {
    // Get current user to check config ID
    const currentUsers = await db
      .select()
      .from(basicAuthUsers)
      .where(eq(basicAuthUsers.id, id));

    if (currentUsers.length === 0) {
      throw new Error("User not found");
    }

    const currentUser = currentUsers[0];

    // Check if username already exists in this config (excluding current user)
    const existing = await db
      .select()
      .from(basicAuthUsers)
      .where(eq(basicAuthUsers.configId, currentUser.configId));

    if (existing.some(user => user.username === data.username && user.id !== id)) {
      throw new Error("Username already exists in this configuration");
    }

    const updateData: Partial<BasicAuthUser> = {
      username: data.username,
      updatedAt: new Date(),
    };

    if (data.passwordHash) {
      updateData.passwordHash = data.passwordHash;
    }

    const result = await db
      .update(basicAuthUsers)
      .set(updateData)
      .where(eq(basicAuthUsers.id, id))
      .returning();

    return result[0];
  }

  static async deleteUser(id: string): Promise<void> {
    const result = await db
      .delete(basicAuthUsers)
      .where(eq(basicAuthUsers.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("User not found");
    }
  }

  // Utility methods
  static async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 12);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  // Get all users with password hashes for Traefik config generation
  static async getUsersWithHashesByConfigId(configId: string): Promise<BasicAuthUser[]> {
    return await db
      .select()
      .from(basicAuthUsers)
      .where(eq(basicAuthUsers.configId, configId));
  }
}