import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Driver-agnostic database handle. The app uses node-postgres; tests use an in-memory PGlite
 * database. Transactions (`db.transaction(tx => …)`) are also accepted wherever a Db is expected.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
