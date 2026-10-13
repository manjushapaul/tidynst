import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { allowedTargetsForRuntime, assertDatabaseTarget } from "@/db/config";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

type Connection = { db: Db; pool: Pool };

const globalForDb = globalThis as typeof globalThis & { __tidynestDb?: Connection };

function connect(): Connection {
  const url = process.env.DATABASE_URL;
  const parsed = assertDatabaseTarget(url, allowedTargetsForRuntime(process.env));
  const pool = new Pool({
    connectionString: url,
    max: parsed.isLocal ? 5 : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    console.error("Database pool error:", error.message);
  });
  return { db: drizzle(pool, { schema }), pool };
}

/** Lazily-created, process-wide database handle. Server-only. */
export function getDb(): Db {
  globalForDb.__tidynestDb ??= connect();
  return globalForDb.__tidynestDb.db;
}
