export const CATEGORY_SLUGS = [
  "kitchen",
  "bathroom",
  "bedroom-wardrobe",
  "small-apartments",
  "renters",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export type Category = {
  slug: CategorySlug;
  name: string;
  navLabel: string;
  /** Meta description: unique, under ~155 characters. */
  description: string;
  /** Opening paragraph on the category page. */
  intro: string;
  /** What the category covers, shown as a short list. */
  covers: readonly string[];
};

export const categories: readonly Category[] = [
  {
    slug: "kitchen",
    name: "Kitchen",
    navLabel: "Kitchen",
    description:
      "Organising compact Indian kitchens: spice storage, counters, cabinets, under-sink space and everyday utensils that need a home.",
    intro:
      "Indian kitchens work hard: masalas within reach, steel dabbas, a pressure cooker, the mixer grinder and a gas stove often share a single platform. These guides focus on making that space easier to cook in, without renovation.",
    covers: [
      "Spice and dabba storage",
      "Counters and platforms",
      "Cabinets and under-sink space",
      "Fridge and pantry",
    ],
  },
  {
    slug: "bathroom",
    name: "Bathroom",
    navLabel: "Bathroom",
    description:
      "Practical storage for small, wet Indian bathrooms: shelves, hooks and corner storage that cope with humidity, tiles and daily use.",
    intro:
      "Small bathrooms in Indian homes are often wet rooms with tiled walls, a bucket and mug, and very little flat surface. Good storage here has to handle humidity and water, and should be easy to clean.",
    covers: [
      "Shelves and corner storage",
      "Hooks and towel space",
      "Wet-area considerations",
      "Toiletries and cleaning supplies",
    ],
  },
  {
    slug: "bedroom-wardrobe",
    name: "Bedroom & Wardrobe",
    navLabel: "Wardrobe",
    description:
      "Organising wardrobes, steel almirahs and small bedrooms: folding, hanging, saree and seasonal storage for Indian clothing.",
    intro:
      "Whether it is a steel almirah, a built-in wardrobe or an open rail, bedroom storage in Indian homes has to hold everyday clothes, occasion wear like sarees and lehengas, and seasonal bedding.",
    covers: [
      "Wardrobes and almirahs",
      "Saree and occasion-wear storage",
      "Seasonal and bedding storage",
      "Under-bed space",
    ],
  },
  {
    slug: "small-apartments",
    name: "Small Apartments",
    navLabel: "Small apartments",
    description:
      "Making 1BHK and 2BHK apartments feel larger: multipurpose furniture, vertical storage, entryways and work-from-home corners.",
    intro:
      "In a 1BHK or compact 2BHK, every room does more than one job. These guides cover whole-home approaches: entryways, living rooms, balconies, work corners and the habits that keep a small home calm.",
    covers: [
      "Entryways and shoe storage",
      "Living and dining spaces",
      "Balconies and utility areas",
      "Work-from-home corners",
    ],
  },
  {
    slug: "renters",
    name: "Renters",
    navLabel: "Renters",
    description:
      "Organising a rented home without losing your deposit: no-drill storage, removable solutions and setups you can take with you.",
    intro:
      "If you rent, you often cannot drill, repaint or change fittings. These guides focus on removable, portable and damage-free ways to organise — and on checking your rental agreement before you start.",
    covers: [
      "No-drill and removable storage",
      "Portable furniture",
      "Protecting walls and fittings",
      "Moving-friendly setups",
    ],
  },
];

const bySlug = new Map<string, Category>(categories.map((category) => [category.slug, category]));

export function getCategory(slug: string): Category | undefined {
  return bySlug.get(slug);
}

export function isCategorySlug(value: string): value is CategorySlug {
  return bySlug.has(value);
}

export function categoryPath(slug: CategorySlug): string {
  return `/categories/${slug}`;
}
