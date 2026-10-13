import type * as React from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession } from "@/server/auth/sessions";
import { createTestDb, type TestDb } from "../support/test-db";

const request = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  db: null as Db | null,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => request.headers.get(name.toLowerCase()) ?? null }),
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => request.cookies.set(name, value),
    delete: ({ name }: { name: string }) => request.cookies.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/server/db", () => ({ getDb: () => request.db }));
// React's request cache is not active outside a render; call through directly.
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  cache: <T>(fn: T) => fn,
}));

const { requireAction, requireSession, SESSION_COOKIE } = await import("@/server/auth/request");

let t: TestDb;
let csrf: string;
let authorCsrf: string;
let authorToken: string;
let ownerToken: string;

beforeAll(async () => {
  t = await createTestDb();
  request.db = t.db;
  const [owner] = await t.db
    .insert(users)
    .values({ email: "owner@example.test", name: "Owner", role: "owner", passwordHash: "x" })
    .returning();
  const [author] = await t.db
    .insert(users)
    .values({ email: "author@example.test", name: "Author", role: "author", passwordHash: "x" })
    .returning();
  const ownerSession = await createSession(t.db, owner!.id, null);
  const authorSession = await createSession(t.db, author!.id, null);
  ownerToken = ownerSession.token;
  authorToken = authorSession.token;
  const { validateSession } = await import("@/server/auth/sessions");
  csrf = (await validateSession(t.db, ownerToken))!.csrfToken;
  authorCsrf = (await validateSession(t.db, authorToken))!.csrfToken;
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  request.headers.clear();
  request.cookies.clear();
  request.headers.set("host", "localhost:3100");
  request.headers.set("origin", "http://localhost:3100");
  request.cookies.set(SESSION_COOKIE, ownerToken);
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("requireAction", () => {
  it("accepts a same-origin request with a valid session and CSRF token", async () => {
    const session = await requireAction(form({ csrf }), "user.manage");
    expect(session.user.email).toBe("owner@example.test");
  });

  it("rejects requests without an Origin header", async () => {
    request.headers.delete("origin");
    await expect(requireAction(form({ csrf }))).rejects.toThrow(/Missing Origin/);
  });

  it("rejects cross-origin requests", async () => {
    request.headers.set("origin", "https://evil.example");
    await expect(requireAction(form({ csrf }))).rejects.toThrow(/Cross-origin/);
    request.headers.set("origin", "null");
    await expect(requireAction(form({ csrf }))).rejects.toThrow(/Origin/);
  });

  it("uses the forwarded host behind a proxy", async () => {
    request.headers.set("x-forwarded-host", "tidynest.example");
    request.headers.set("origin", "https://tidynest.example");
    await expect(requireAction(form({ csrf }))).resolves.toBeTruthy();
    request.headers.set("origin", "http://localhost:3100");
    await expect(requireAction(form({ csrf }))).rejects.toThrow(/Cross-origin/);
  });

  it("rejects a missing or wrong CSRF token", async () => {
    await expect(requireAction(form({}))).rejects.toThrow(/form has expired/);
    await expect(requireAction(form({ csrf: `${csrf}x` }))).rejects.toThrow(/form has expired/);
    // Another user's token is not accepted for this session.
    await expect(requireAction(form({ csrf: authorCsrf }))).rejects.toThrow(/form has expired/);
  });

  it("rejects requests without a valid session", async () => {
    request.cookies.clear();
    await expect(requireAction(form({ csrf }))).rejects.toThrow(/session has expired/);
    request.cookies.set(SESSION_COOKIE, "forged-token");
    await expect(requireAction(form({ csrf }))).rejects.toThrow(/session has expired/);
  });

  it("enforces permissions", async () => {
    request.cookies.set(SESSION_COOKIE, authorToken);
    await expect(requireAction(form({ csrf: authorCsrf }), "user.manage")).rejects.toThrow(/permission/);
    await expect(requireAction(form({ csrf: authorCsrf }), "guide.create")).resolves.toBeTruthy();
  });
});

describe("requireSession", () => {
  it("redirects to the login page without a session", async () => {
    request.cookies.clear();
    await expect(requireSession()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("returns the session when signed in", async () => {
    await expect(requireSession()).resolves.toMatchObject({ user: { role: "owner" } });
  });
});
