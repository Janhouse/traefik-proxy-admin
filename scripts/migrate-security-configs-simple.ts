#!/usr/bin/env tsx

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://admin:password@localhost:5432/traefik_share";

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

/**
 * Migration script to move existing service security configurations
 * from the old single-auth format to the new multi-auth format
 */
async function migrateSecurityConfigs() {
  console.log("Starting security configuration migration...");

  try {
    // First, create the new table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "service_security_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "service_id" uuid NOT NULL,
        "security_type" varchar(50) NOT NULL,
        "is_enabled" boolean DEFAULT true NOT NULL,
        "priority" integer DEFAULT 0 NOT NULL,
        "config" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraint (skip if exists)
    try {
      await db.execute(sql`
        ALTER TABLE "service_security_configs"
        ADD CONSTRAINT "service_security_configs_service_id_services_id_fk"
        FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
        ON DELETE cascade ON UPDATE no action;
      `);
    } catch (error) {
      // Constraint may already exist, continue
      console.log("Foreign key constraint already exists or couldn't be created");
    }

    // Get all existing services with their security configurations
    const existingServices = await db.execute(sql`
      SELECT
        id,
        auth_method,
        sso_groups,
        sso_users,
        basic_auth_config_id
      FROM services
      WHERE auth_method IS NOT NULL AND auth_method != 'none'
    `);

    console.log(`Found ${existingServices.rows.length} services with security configurations`);

    // Migrate each service's security configuration
    for (const service of existingServices.rows) {
      const serviceId = service.id as string;
      const authMethod = service.auth_method as string;

      console.log(`Migrating service ${serviceId} with auth method: ${authMethod}`);

      if (authMethod === 'shared_link') {
        // For shared_link, create a security config with basic settings
        await db.execute(sql`
          INSERT INTO service_security_configs (service_id, security_type, is_enabled, priority, config)
          VALUES (
            ${serviceId},
            'shared_link',
            true,
            0,
            '{"expiresInHours": 24, "sessionDurationMinutes": 60}'
          )
        `);
      } else if (authMethod === 'sso') {
        // For SSO, migrate groups and users
        const config = {
          groups: service.sso_groups ? JSON.parse(service.sso_groups as string) : [],
          users: service.sso_users ? JSON.parse(service.sso_users as string) : []
        };

        await db.execute(sql`
          INSERT INTO service_security_configs (service_id, security_type, is_enabled, priority, config)
          VALUES (
            ${serviceId},
            'sso',
            true,
            0,
            ${JSON.stringify(config)}
          )
        `);
      } else if (authMethod === 'basic_auth' && service.basic_auth_config_id) {
        // For basic auth, migrate the config ID
        const config = {
          basicAuthConfigId: service.basic_auth_config_id as string
        };

        await db.execute(sql`
          INSERT INTO service_security_configs (service_id, security_type, is_enabled, priority, config)
          VALUES (
            ${serviceId},
            'basic_auth',
            true,
            0,
            ${JSON.stringify(config)}
          )
        `);
      }
    }

    console.log("Migration completed successfully!");
    console.log("You can now safely apply the schema changes with 'pnpm db:push'");

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the migration
migrateSecurityConfigs();