import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

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
