import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Type exports for better TypeScript support
export type Database = typeof db;
export type DatabaseSchema = typeof schema;
export type ConnectionClient = Pool;

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://admin:password@localhost:5432/traefik_share";

// Create the connection pool with configuration
const pool = new Pool({
  connectionString: connectionString,
  max: parseInt(process.env.DB_CONNECTION_LIMIT || "10"),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Create the database instance with schema
export const db = drizzle({ client: pool, schema });

export * from "./schema";

// Graceful shutdown function
export async function closeDatabase() {
  try {
    await pool.end();
    console.log("Database connection pool closed gracefully");
  } catch (error) {
    console.error("Error closing database connection pool:", error);
  }
}
