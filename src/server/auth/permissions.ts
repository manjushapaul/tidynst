export type Role = "owner" | "editor" | "author";

export type Permission =
  | "guide.create"
  | "guide.editAny"
  | "guide.editOwn"
  | "guide.submit"
  | "guide.review"
  | "guide.publish"
  | "guide.delete"
  | "product.manage"
  | "media.upload"
  | "media.delete"
  | "user.manage"
  | "audit.view";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "guide.create",
    "guide.editAny",
    "guide.editOwn",
    "guide.submit",
    "guide.review",
    "guide.publish",
    "guide.delete",
    "product.manage",
    "media.upload",
    "media.delete",
    "user.manage",
    "audit.view",
  ]),
  editor: new Set<Permission>([
    "guide.create",
    "guide.editAny",
    "guide.editOwn",
    "guide.submit",
    "guide.review",
    "guide.publish",
    "guide.delete",
    "product.manage",
    "media.upload",
    "media.delete",
    "audit.view",
  ]),
  author: new Set<Permission>(["guide.create", "guide.editOwn", "guide.submit", "media.upload"]),
};

export type Actor = { id: string; role: Role; name: string; email: string };

export function can(actor: Pick<Actor, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role].has(permission);
}

/** Whether the actor may edit (save, restore, submit) a specific guide. */
export function canEditGuide(actor: Pick<Actor, "id" | "role">, guide: { createdBy: string }): boolean {
  return can(actor, "guide.editAny") || (can(actor, "guide.editOwn") && guide.createdBy === actor.id);
}

export class AuthorizationError extends Error {
  override name = "AuthorizationError";
  constructor(message = "You do not have permission to do that.") {
    super(message);
  }
}

export function assertCan(actor: Pick<Actor, "role">, permission: Permission): void {
  if (!can(actor, permission)) throw new AuthorizationError();
}

export const ROLE_LABELS: Record<Role, string> = { owner: "Owner", editor: "Editor", author: "Author" };
