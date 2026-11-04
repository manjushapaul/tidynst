type ErrorRecord = { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };

function asRecord(error: unknown): ErrorRecord | null {
  return typeof error === "object" && error !== null ? (error as ErrorRecord) : null;
}

/** Walks Drizzle's wrapped errors for a PostgreSQL SQLSTATE or constraint name. */
export function postgresErrorInfo(error: unknown): { code: string | null; constraint: string | null } {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let code: string | null = null;
  let constraint: string | null = null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const record = asRecord(current);
    if (!record) break;
    if (typeof record.code === "string" && code === null) code = record.code;
    if (typeof record.constraint === "string" && constraint === null) constraint = record.constraint;
    current = record.cause;
  }
  return { code, constraint };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = postgresErrorInfo(error);
  if (info.code !== "23505") return false;
  return constraint ? info.constraint === constraint : true;
}
