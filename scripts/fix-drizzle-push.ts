// fix_drizzle_push.ts
import original_config, { dbCredentials } from "../drizzle.config";

import { MigrationConfig, readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

const config = {
  ...original_config,
  migrationsFolder: original_config.out,
  migrationsTable: original_config.migrations?.table ?? "__drizzle_migrations",
  migrationsSchema: original_config.migrations?.schema ?? "drizzle",
} as MigrationConfig;

const migrations = readMigrationFiles(config);

const sql = postgres(dbCredentials.url);

const table_name = `${config.migrationsSchema}.${config.migrationsTable}`;

const get_db_migrations = sql`SELECT id, hash, created_at FROM ${sql(
  table_name
)}`;

async function main() {
  console.log("Running migration marking sctipt");

  let db_migrations_hashs;
  try {
    db_migrations_hashs = (await get_db_migrations.execute()).map((m) => {
      return m.hash as string;
    });
  } catch (error) {
    console.log(error);
    return;
  }

  for (const migration of migrations) {
    if (!db_migrations_hashs.includes(migration.hash)) {
      console.log(
        `######## Adding migration to ${table_name}:\n\n${migration.sql}\n\n`
      );
      const new_db_migration = {
        hash: migration.hash,
        created_at: migration.folderMillis,
      };
      await sql`INSERT INTO ${sql(table_name)} ${sql(
        new_db_migration,
        "hash",
        "created_at"
      )}`.execute();
    }
  }
}

main().finally(() => process.exit(0));