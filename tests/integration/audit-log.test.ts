import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "@/db/schema";
import {
  auditEntityHref,
  listAuditEvents,
  normaliseAuditQuery,
  safeAuditDetails,
} from "@/server/admin/audit-log";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
let owner: Actor;
let editor: Actor;
let author: Actor;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  editor = asActor(await insertUser(t.db, "editor"));
  author = asActor(await insertUser(t.db, "author"));
  const productId = "11111111-2222-4333-8444-555555555555";
  await t.db.insert(auditEvents).values([
    ...Array.from({ length: 55 }, (_, index) => ({
      actorId: owner.id,
      action: "guide.saved",
      entityType: "guide",
      entityId: "22222222-3333-4444-8555-666666666666",
      details: { version: index + 2 },
      createdAt: new Date("2026-03-10T06:00:00Z"),
    })),
    {
      actorId: editor.id,
      action: "product.retired",
      entityType: "product",
      entityId: productId,
      details: { from: "active", to: "retired", publishedArticles: 2 },
      createdAt: new Date("2026-03-20T20:00:00Z"),
    },
    {
      actorId: owner.id,
      action: "product.updated",
      entityType: "product",
      entityId: "99999999-2222-4333-8444-555555555555",
      details: { changedFields: ["summary"] },
      createdAt: new Date("2026-03-01T06:00:00Z"),
    },
    {
      actorId: null,
      action: "auth.login_failed",
      details: {
        knownAccount: true,
        password: "hunter2-secret",
        token: "tok_secret",
        ip: "203.0.113.9",
        reason: "<script>alert(1)</script>",
      },
      createdAt: new Date("2026-03-21T04:00:00Z"),
    },
  ]);
});

afterAll(async () => {
  await t.close();
});

describe("audit log access and filters", () => {
  it("is limited to users with audit.view", async () => {
    await expect(listAuditEvents(t.db, author, { page: 1 })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await listAuditEvents(t.db, editor, { page: 1 })).total).toBeGreaterThan(0);
  });

  it("paginates in the database, newest first", async () => {
    const first = await listAuditEvents(t.db, owner, { action: "guide.saved", page: 1 });
    const second = await listAuditEvents(t.db, owner, { action: "guide.saved", page: 2 });
    expect(first.total).toBe(55);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(5);
    expect(first.items[0]!.id).toBeGreaterThan(first.items[49]!.id);
  });

  it("filters by actor, entity type and India-time date range", async () => {
    const byEditor = await listAuditEvents(t.db, owner, { actorId: editor.id, page: 1 });
    expect(byEditor.items.map((item) => item.action)).toEqual(["product.retired"]);
    const productsOnly = await listAuditEvents(t.db, owner, { entityType: "product", page: 1 });
    expect(productsOnly.total).toBe(2);
    const oneProduct = await listAuditEvents(t.db, owner, {
      entityType: "product",
      entityId: "11111111-2222-4333-8444-555555555555",
      page: 1,
    });
    expect(oneProduct.items.map((item) => item.action)).toEqual(["product.retired"]);
    // 2026-03-20T20:00Z is 21 March 01:30 in India.
    const march21 = await listAuditEvents(t.db, owner, { from: "2026-03-21", to: "2026-03-21", page: 1 });
    expect(march21.items.map((item) => item.action).sort()).toEqual(["auth.login_failed", "product.retired"]);
    const march10 = await listAuditEvents(t.db, owner, { from: "2026-03-10", to: "2026-03-10", page: 1 });
    expect(march10.total).toBe(55);
  });

  it("normalises untrusted query parameters", () => {
    expect(
      normaliseAuditQuery({
        action: "drop table",
        actorId: "not-a-uuid",
        entityType: "secrets",
        from: "2026-02-30",
        to: "yesterday",
        page: "0",
      }),
    ).toEqual({ page: 1 });
    expect(normaliseAuditQuery({ action: "guide.published", entityType: "guide", page: "3" })).toEqual({
      action: "guide.published",
      entityType: "guide",
      page: 3,
    });
    const id = "11111111-2222-4333-8444-555555555555";
    expect(normaliseAuditQuery({ entityId: id })).toEqual({ page: 1 });
    expect(normaliseAuditQuery({ entityType: "product", entityId: "1 OR 1=1" })).toEqual({
      entityType: "product",
      page: 1,
    });
    expect(normaliseAuditQuery({ entityType: "product", entityId: id.toUpperCase() })).toEqual({
      entityType: "product",
      entityId: id,
      page: 1,
    });
  });
});

describe("audit details", () => {
  it("shows only allow-listed keys and never secrets, IPs or account-existence hints", async () => {
    const result = await listAuditEvents(t.db, owner, { action: "auth.login_failed", page: 1 });
    const details = result.items[0]!.details;
    const text = JSON.stringify(details);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("tok_secret");
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("knownAccount");
    // Values are returned as plain strings; React escapes them when rendering.
    expect(details).toEqual([{ label: "Reason", value: "<script>alert(1)</script>" }]);
  });

  it("truncates content hashes and formats values", () => {
    expect(
      safeAuditDetails({
        contentHash: "a".repeat(64),
        selfApproved: true,
        changedFields: ["name", "status"],
      }),
    ).toEqual([
      { label: "Self-approved", value: "yes" },
      { label: "Changed fields", value: "name, status" },
      { label: "Content hash", value: `${"a".repeat(12)}…` },
    ]);
    expect(safeAuditDetails(["not", "an", "object"])).toEqual([]);
  });

  it("only links to entities the viewer can open", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(auditEntityHref(owner, "user", id)).toBe("/admin/users");
    expect(auditEntityHref(editor, "user", id)).toBeNull();
    expect(auditEntityHref(editor, "product", id)).toBe(`/admin/products/${id}`);
    expect(auditEntityHref(editor, "guide", "javascript:alert(1)")).toBeNull();
  });
});
