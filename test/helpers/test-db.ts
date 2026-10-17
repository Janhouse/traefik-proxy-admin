import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

/**
 * In-process Postgres (PGlite) with the real migrations applied — for tests
 * that need actual SQL semantics (ownership filters, unique indexes, cascades)
 * without a running database server.
 *
 * Usage (the factory runs once per test file):
 *
 *   vi.mock("@/lib/db", async () => {
 *     const { createTestDbModule } = await import("./helpers/test-db");
 *     return createTestDbModule();
 *   });
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
  return { client, db };
}

/** A drop-in replacement for the `@/lib/db` module backed by PGlite. */
export async function createTestDbModule() {
  const { db } = await createTestDb();
  return { ...schema, db };
}

/** Delete every row from the given tables (child tables first). */
export async function truncateAll(db: { execute: (q: string) => Promise<unknown> }) {
  await db.execute(
    'TRUNCATE "router_metric_samples", "sessions", "shared_links", "service_security_configs", "services", "api_tokens", "domains", "app_config" CASCADE'
  );
}
