/** Longest public path we will count. Matches the database check. */
export const PAGE_PATH_MAX = 200;

const BLOCKED = ["/admin", "/media", "/_next", "/og", "/page-view"];

/**
 * A public page address worth counting. Query strings, hashes, admin routes and asset paths are
 * dropped so a count never stores a search, a token or an internal URL.
 */
export function normalisePagePath(input: string): string | null {
  if (input.length === 0 || input.length > PAGE_PATH_MAX) return null;
  if (!input.startsWith("/") || input.startsWith("//")) return null;
  if (/[?#\\\s]/.test(input) || input.includes("..")) return null;
  let path = input.toLowerCase();
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path.length === 0 || path.length > PAGE_PATH_MAX) return null;
  if (path !== "/" && !/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path)) return null;
  if (BLOCKED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;
  return path;
}

/** Calendar day in Asia/Kolkata (YYYY-MM-DD), matching the editorial timezone. */
export function analyticsDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Adds calendar days to a YYYY-MM-DD string. */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) throw new Error("Invalid analytics day.");
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

const BOT = /\b(bot|crawler|spider|slurp|preview)\b/i;

/** Skips known automated clients. The user agent itself is never stored. */
export function isAutomatedClient(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT.test(userAgent);
}
