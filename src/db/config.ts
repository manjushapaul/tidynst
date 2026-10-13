/**
 * Database target validation. This project uses its own databases, named distinctly so that a
 * connection string for any other project (including the previous TidyNest site) is rejected.
 *
 * Error messages never include the connection string.
 */

export const DATABASE_NAMES = {
  development: "tidynest_cms_dev",
  qa: "tidynest_cms_qa",
  production: "tidynest_cms_prod",
} as const;

export type DatabaseTarget = keyof typeof DATABASE_NAMES;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SECURE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

export class DatabaseConfigError extends Error {
  override name = "DatabaseConfigError";
}

export type ParsedDatabaseUrl = {
  databaseName: string;
  host: string;
  isLocal: boolean;
};

export function parseDatabaseUrl(raw: string | undefined): ParsedDatabaseUrl {
  if (!raw || !raw.trim()) {
    throw new DatabaseConfigError("DATABASE_URL is not set.");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new DatabaseConfigError("DATABASE_URL is not a valid URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new DatabaseConfigError("DATABASE_URL must use the postgres:// or postgresql:// scheme.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new DatabaseConfigError("DATABASE_URL does not name a database.");
  }
  const host = url.hostname;
  const isLocal = LOCAL_HOSTS.has(host) || url.searchParams.has("host");
  if (!isLocal && !SECURE_SSL_MODES.has(url.searchParams.get("sslmode") ?? "")) {
    throw new DatabaseConfigError("Remote databases must be reached over TLS (sslmode=require or stricter).");
  }
  return { databaseName, host, isLocal };
}

/**
 * Which database targets the running app may use. Production databases are only reachable from
 * a Vercel production deployment; everything else may only use development or QA databases.
 */
export function allowedTargetsForRuntime(env: Record<string, string | undefined>): DatabaseTarget[] {
  if (env.VERCEL_ENV === "production") return ["production"];
  return ["development", "qa"];
}

export function assertDatabaseTarget(
  raw: string | undefined,
  allowed: readonly DatabaseTarget[],
): ParsedDatabaseUrl {
  const parsed = parseDatabaseUrl(raw);
  const match = allowed.find((target) => DATABASE_NAMES[target] === parsed.databaseName);
  if (!match) {
    const expected = allowed.map((target) => DATABASE_NAMES[target]).join(" or ");
    throw new DatabaseConfigError(`DATABASE_URL must point at ${expected} in this environment.`);
  }
  if (match === "qa" && !parsed.isLocal) {
    throw new DatabaseConfigError("The QA database must be a local, disposable database.");
  }
  return parsed;
}
