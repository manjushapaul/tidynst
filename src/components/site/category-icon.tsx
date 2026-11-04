import Image, { type StaticImageData } from "next/image";
import bathroomIllustration from "@/assets/categories/bathroom.png";
import bedroomWardrobeIllustration from "@/assets/categories/bedroom-wardrobe.png";
import kitchenIllustration from "@/assets/categories/kitchen.png";
import rentersIllustration from "@/assets/categories/renters.png";
import smallApartmentsIllustration from "@/assets/categories/small-apartments.png";
import type { CategorySlug } from "@/content/categories";

const illustrations: Partial<Record<CategorySlug, StaticImageData>> = {
  kitchen: kitchenIllustration,
  bathroom: bathroomIllustration,
  "bedroom-wardrobe": bedroomWardrobeIllustration,
  "small-apartments": smallApartmentsIllustration,
  renters: rentersIllustration,
};

export function hasCategoryIllustration(slug: CategorySlug): boolean {
  return slug in illustrations;
}

/**
 * Decorative picture for a category, scaled to fit a `size` × `size` pixel box whatever its
 * shape. Renders nothing if the category has none.
 */
export function CategoryIllustration({
  slug,
  size,
  className,
}: {
  slug: CategorySlug;
  size: number;
  className?: string;
}) {
  const image = illustrations[slug];
  if (!image) return null;
  const scale = size / Math.max(image.width, image.height);
  return (
    <Image
      src={image}
      alt=""
      width={Math.round(image.width * scale)}
      height={Math.round(image.height * scale)}
      className={className}
    />
  );
}

const paths: Record<CategorySlug, React.ReactNode> = {
  kitchen: (
    <>
      <path d="M5 10h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8Z" />
      <path d="M3 10h18M9 6.5c0-1 .8-1.5 1.5-1.5M13 6.5c0-1 .8-1.5 1.5-1.5" />
    </>
  ),
  bathroom: (
    <>
      <path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2Z" />
      <path d="M7 12V6a2 2 0 0 1 3.6-1.2M8 19l-1 2M16 19l1 2" />
    </>
  ),
  "bedroom-wardrobe": (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M12 3.5v17M10 11v2M14 11v2" />
    </>
  ),
  "small-apartments": (
    <>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6M3 20h18" />
    </>
  ),
  renters: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H20M17 12v3M20 12v2" />
    </>
  ),
};

export function CategoryIcon({ slug, className }: { slug: CategorySlug; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[slug]}
    </svg>
  );
}
