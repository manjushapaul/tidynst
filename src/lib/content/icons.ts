export const CMS_ICON_KEYS = [
  "utensils",
  "cooking-pot",
  "bath",
  "sparkles",
  "shirt",
  "bed",
  "home",
  "key",
  "box",
  "layers",
  "tag",
  "folder",
  "leaf",
  "sun",
  "lamp",
  "sofa",
  "door-open",
  "wrench",
  "shopping-basket",
  "refrigerator",
] as const;

export type CmsIconKey = (typeof CMS_ICON_KEYS)[number];

export type CmsIconMeta = {
  key: CmsIconKey;
  label: string;
};

export const CMS_ICONS: readonly CmsIconMeta[] = [
  { key: "utensils", label: "Utensils" },
  { key: "cooking-pot", label: "Cooking pot" },
  { key: "refrigerator", label: "Fridge & pantry" },
  { key: "shopping-basket", label: "Basket" },
  { key: "bath", label: "Bath" },
  { key: "sparkles", label: "Clean & tidy" },
  { key: "shirt", label: "Wardrobe" },
  { key: "bed", label: "Bedroom" },
  { key: "sofa", label: "Living room" },
  { key: "home", label: "Home" },
  { key: "door-open", label: "Entryway" },
  { key: "key", label: "Renters / keys" },
  { key: "box", label: "Storage box" },
  { key: "layers", label: "Shelves" },
  { key: "lamp", label: "Lighting" },
  { key: "leaf", label: "Balcony / plants" },
  { key: "sun", label: "Utility / laundry" },
  { key: "wrench", label: "No-drill / tools" },
  { key: "tag", label: "Labels" },
  { key: "folder", label: "Organiser" },
];

const iconSet = new Set<string>(CMS_ICON_KEYS);

export function isCmsIconKey(value: string): value is CmsIconKey {
  return iconSet.has(value);
}

export function normalizeCmsIcon(value: string | null | undefined): CmsIconKey | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isCmsIconKey(trimmed) ? trimmed : null;
}
