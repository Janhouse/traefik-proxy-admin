import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dbCredentials, migrationsFolder } from "@/drizzle.config";
import postgres from "postgres";

function getBuildId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    return fs.readFileSync("./.next/BUILD_ID", "utf8").trim();
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return "development";
    }
    return "development";
  }
}

async function runMigrations() {
  console.log("Running database migrations");
  try {
    const migrationClient = postgres(dbCredentials.url, { max: 1 });
    const db = drizzle(dbCredentials.url);
    await migrate(db, { migrationsFolder: migrationsFolder });
    await migrationClient.end();
  } catch (error) {
    console.log(`Running migrations failed, please do it manually - ${error}`);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  process.env["BUILD_ID"] = getBuildId();
  await runMigrations();
}
