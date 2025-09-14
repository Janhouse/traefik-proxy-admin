import { defineConfig } from "drizzle-kit";

export const dbCredentials = {
  url:
    process.env.DATABASE_URL ||
    "postgresql://admin:password@localhost:5432/traefik_share",
};

export const migrationsFolder = "./drizzle/migrations";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: migrationsFolder,
  dialect: "postgresql",
  dbCredentials: dbCredentials,
});
