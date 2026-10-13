/**
 * Google Analytics is off unless BOTH are set, which the owner does only after approving it:
 *   NEXT_PUBLIC_ANALYTICS_ENABLED=true
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX
 * It is never loaded on /admin.
 */
export function analyticsMeasurementId(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true") return null;
  const id = env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return id && /^G-[A-Z0-9]{4,20}$/.test(id) ? id : null;
}
