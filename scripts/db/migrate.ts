/**
 * Applies the version-controlled migrations in ./drizzle to one explicitly named target.
 *
 *   npm run db:migrate -- --target=development
 *   npm run db:migrate -- --target=qa
 *   npm run db:migrate -- --target=production --confirm=tidynest_cms_prod   (owner only, never automatic)
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import {
  assertDatabaseTarget,
  DATABASE_NAMES,
  DatabaseConfigError,
  type DatabaseTarget,
} from "../../src/db/config";
import { parseArgs } from "../lib/args";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target as DatabaseTarget | undefined;
  if (!target || !(target in DATABASE_NAMES)) {
    throw new DatabaseConfigError("Pass --target=development, --target=qa or --target=production.");
  }
  if (target === "production") {
    if (process.env.CI) throw new DatabaseConfigError("Production migrations are never run from CI.");
    if (args.confirm !== DATABASE_NAMES.production) {
      throw new DatabaseConfigError(`Production migrations require --confirm=${DATABASE_NAMES.production}.`);
    }
  }

  const parsed = assertDatabaseTarget(process.env.DATABASE_URL, [target]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log(`Migrations applied to ${parsed.databaseName}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof DatabaseConfigError ? error.message : "Migration failed.";
  console.error(message);
  if (!(error instanceof DatabaseConfigError) && error instanceof Error) {
    // Postgres errors do not contain the connection string; print the code and message only.
    console.error((error as Error & { code?: string }).code ?? "", error.message);
  }
  process.exit(1);
});
