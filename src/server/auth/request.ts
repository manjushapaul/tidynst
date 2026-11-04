import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { site } from "@/lib/site";
import { getDb } from "@/server/db";
import { AuthorizationError, can, type Permission } from "./permissions";
import { safeEqual } from "./tokens";
import { type ValidSession, validateSession } from "./sessions";

const secureCookies = new URL(site.url).protocol === "https:";

/** `__Host-` cookies must be Secure, host-only and path=/; only possible over https. */
export const SESSION_COOKIE = secureCookies ? "__Host-tidynest_session" : "tidynest_session";

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/" });
}

/** The current request's session, validated once per request. */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(getDb(), token);
});

/** For admin pages: redirects to the login page when there is no valid session. */
export async function requireSession(): Promise<ValidSession> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

export class ActionSecurityError extends Error {
  override name = "ActionSecurityError";
}

export async function requestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
  origin: string | null;
  host: string | null;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
    origin: h.get("origin"),
    host: h.get("x-forwarded-host") ?? h.get("host"),
  };
}

/**
 * Requires a same-origin request. Next.js already rejects mismatched Origin headers for Server
 * Actions but lets requests without one through; admin mutations require it to be present.
 */
export async function assertSameOrigin(): Promise<void> {
  const { origin, host } = await requestMeta();
  if (!origin || !host) throw new ActionSecurityError("Missing Origin header.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ActionSecurityError("Invalid Origin header.");
  }
  if (originHost !== host) throw new ActionSecurityError("Cross-origin request rejected.");
}

/**
 * Authenticates and authorises a Server Action: same origin, a valid session, a matching CSRF
 * token, and (optionally) a permission. Every admin mutation calls this first.
 */
export async function requireAction(formData: FormData, permission?: Permission): Promise<ValidSession> {
  await assertSameOrigin();
  const session = await getSession();
  if (!session) throw new ActionSecurityError("Your session has expired. Please sign in again.");
  const token = formData.get("csrf");
  if (typeof token !== "string" || !safeEqual(token, session.csrfToken)) {
    throw new ActionSecurityError("The form has expired. Reload the page and try again.");
  }
  if (permission && !can(session.user, permission)) throw new AuthorizationError();
  return session;
}
