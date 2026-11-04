export const AUDIT_ACTION_LABELS = {
  "auth.login_succeeded": "signed in",
  "auth.login_failed": "failed to sign in",
  "auth.login_rate_limited": "was rate limited at sign-in",
  "auth.logout": "signed out",
  "auth.session_revoked": "signed out a session",
  "auth.password_changed": "changed their password",
  "auth.password_reset_requested": "requested a password reset",
  "auth.password_reset_completed": "reset their password with a link",
  "auth.password_reset_rate_limited": "was rate limited requesting a password reset",
  "user.owner_created": "created the owner account",
  "user.created": "added a user",
  "user.role_changed": "changed a user’s role",
  "user.disabled": "disabled a user",
  "user.enabled": "re-enabled a user",
  "user.email_changed": "changed their sign-in email",
  "guide.created": "created an article",
  "guide.saved": "saved an article",
  "guide.restored": "restored an article revision",
  "guide.deleted": "deleted a draft article",
  "guide.review_requested": "submitted an article for review",
  "guide.review_approved": "approved an article",
  "guide.review_changes_requested": "requested changes to an article",
  "guide.review_invalidated": "made an approval or submission stale",
  "guide.published": "published an article",
  "guide.unpublished": "unpublished an article",
  "guide.save_conflict": "hit an edit conflict",
  "topic.created": "created a topic",
  "product.created": "created a product",
  "product.updated": "updated a product",
  "product.activated": "activated a product",
  "product.deactivated": "moved a product back to draft",
  "product.retired": "retired a product",
  "media.uploaded": "uploaded an image",
  "media.deleted": "deleted an image",
  "site.updated": "updated the homepage",
  "subcategory_group.created": "added a category section",
  "subcategory_group.updated": "updated a category section",
  "subcategory_group.deleted": "removed a category section",
  "subcategory.created": "added a subcategory",
  "subcategory.updated": "renamed a subcategory",
  "subcategory.deleted": "removed a subcategory",
  "message.replied": "replied to a contact message",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

export function isAuditAction(value: string): value is AuditAction {
  return Object.hasOwn(AUDIT_ACTION_LABELS, value);
}

export function describeAuditAction(action: string): string {
  return isAuditAction(action) ? AUDIT_ACTION_LABELS[action] : action;
}

export const AUDIT_ENTITY_TYPES = [
  "guide",
  "topic",
  "product",
  "media",
  "user",
  "site",
  "subcategory_group",
  "subcategory",
  "message",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  guide: "Article",
  topic: "Topic",
  product: "Product",
  media: "Image",
  user: "User",
  site: "Homepage",
  subcategory_group: "Category section",
  subcategory: "Subcategory",
  message: "Contact message",
};
