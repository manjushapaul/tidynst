import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guideRevisions, guides, subcategoryGroups, subcategories } from "@/db/schema";
import { slugify } from "@/lib/content/slug";
import { AuthorizationError, type Actor } from "@/server/auth/permissions";
import { GuideFormError } from "@/server/guides/errors";
import { createGuide } from "@/server/guides/workflow";
import { countPublishedGuides, listPublishedGuides, listTopicGuides } from "@/server/public-content";
import {
  SubcategoryFormError,
  createGroup,
  createSubcategory,
  deleteGroup,
  deleteSubcategory,
  getPublicSubcategory,
  guideSection,
  listPublicGroups,
  listSitemapSubcategories,
} from "@/server/subcategories";
import { guideContent } from "../support/fixtures";
import { insertGuide, insertUser } from "../support/seed";
import { createTestDb, type TestDb } from "../support/test-db";

let t: TestDb;
const db = () => t.db;
let owner: Actor;
let author: Actor;

function asActor(user: { id: string; role: Actor["role"]; name: string; email: string }): Actor {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

beforeAll(async () => {
  t = await createTestDb();
  owner = asActor(await insertUser(t.db, "owner"));
  author = asActor(await insertUser(t.db, "author"));
});

afterAll(async () => {
  await t.close();
});

describe("kitchen subcategories", () => {
  it("seeds five kitchen sections and thirty subcategories whose addresses match their names", async () => {
    const groups = await db()
      .select()
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.category, "kitchen"))
      .orderBy(asc(subcategoryGroups.position));
    expect(groups.map((group) => group.name)).toEqual([
      "Food and Grocery Storage",
      "Utensils and Kitchen Essentials",
      "Counters and Space-Saving Storage",
      "Kitchen Cleaning and Waste Management",
      "Kitchen Routines and Smart Organisation",
    ]);
    expect(groups[0]?.description).toBe("Organising ingredients, groceries and everyday cooking essentials.");

    const items = await db()
      .select()
      .from(subcategories)
      .where(eq(subcategories.category, "kitchen"))
      .orderBy(asc(subcategories.position));
    expect(items).toHaveLength(30);
    for (const item of items) expect(item.slug).toBe(slugify(item.name));
    expect(items.filter((item) => item.groupId === groups[0]?.id).map((item) => item.name)).toEqual([
      "Spice and Dabba Storage",
      "Fridge and Pantry",
      "Groceries and Bulk Buying",
      "Grains, Pulses and Flour Storage",
      "Oil, Sauces and Condiment Storage",
      "Snacks and Dry Food Storage",
    ]);
    const bathroom = await listPublicGroups(db(), "bathroom");
    expect(bathroom.map((group) => group.name)).toEqual([
      "Shelves and corner storage",
      "Hooks and towel space",
      "Wet-area considerations",
      "Toiletries and cleaning supplies",
    ]);
  });

  it("lets an owner add a subcategory and refuses an author", async () => {
    const [group] = await db()
      .select()
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.name, "Food and Grocery Storage"))
      .limit(1);
    const created = await createSubcategory(db(), owner, group!.id, { name: "Leftover Containers" });
    expect(created.slug).toBe("leftover-containers");
    await expect(createSubcategory(db(), author, group!.id, { name: "Author shelf" })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await deleteSubcategory(db(), owner, created.id);
  });

  it("lists a published article on its subcategory and keeps drafts off that list", async () => {
    const area = await getPublicSubcategory(db(), "kitchen", "spice-and-dabba-storage");
    expect(area?.name).toBe("Spice and Dabba Storage");
    await insertGuide(
      db(),
      owner.id,
      guideContent({
        slug: "masala-dabba-within-reach",
        subcategoryId: area!.id,
        title: "Keep the masala dabba within reach",
      }),
      { published: true },
    );
    await createGuide(
      db(),
      owner,
      guideContent({
        slug: "draft-dabba-notes",
        subcategoryId: area!.id,
        title: "Draft notes about the dabba",
      }),
    );
    const listed = await listPublishedGuides(db(), {
      category: "kitchen",
      subcategoryId: area!.id,
      limit: 12,
    });
    expect(listed.map((guide) => guide.slug)).toEqual(["masala-dabba-within-reach"]);
    expect(await countPublishedGuides(db(), { category: "kitchen", subcategoryId: area!.id })).toBe(1);
    const sitemap = await listSitemapSubcategories(db());
    expect(sitemap.map((item) => item.slug)).toContain("spice-and-dabba-storage");
    const [draft] = await db().select().from(guides).where(eq(guides.slug, "draft-dabba-notes"));
    const [revision] = await db()
      .select()
      .from(guideRevisions)
      .where(and(eq(guideRevisions.guideId, draft!.id), eq(guideRevisions.revisionNumber, 1)));
    expect(revision?.subcategoryId).toBe(area!.id);
  });

  it("rejects a subcategory address that belongs to an article, a mismatched category, and a delete that is still in use", async () => {
    const [group] = await db()
      .select()
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.name, "Food and Grocery Storage"))
      .limit(1);
    await createGuide(db(), owner, guideContent({ slug: "leftover-tins", title: "Leftover tins" }));
    await expect(createSubcategory(db(), owner, group!.id, { name: "Leftover tins" })).rejects.toBeInstanceOf(
      SubcategoryFormError,
    );

    const pantry = await getPublicSubcategory(db(), "kitchen", "fridge-and-pantry");
    await expect(
      createGuide(
        db(),
        owner,
        guideContent({ slug: "bathroom-with-pantry", category: "bathroom", subcategoryId: pantry!.id }),
      ),
    ).rejects.toBeInstanceOf(GuideFormError);

    await expect(deleteSubcategory(db(), owner, pantry!.id)).resolves.toBeUndefined();
    const spice = await getPublicSubcategory(db(), "kitchen", "spice-and-dabba-storage");
    await expect(deleteSubcategory(db(), owner, spice!.id)).rejects.toBeInstanceOf(SubcategoryFormError);
  });

  it("refuses to delete a section that still has subcategories", async () => {
    const created = await createGroup(db(), owner, {
      category: "bathroom",
      name: "Hooks and rails",
      description: "Places to hang towels and daily items without drilling into the tiles.",
    });
    await expect(deleteGroup(db(), owner, created.id)).resolves.toBeUndefined();
    const [kitchen] = await db()
      .select()
      .from(subcategoryGroups)
      .where(eq(subcategoryGroups.name, "Food and Grocery Storage"))
      .limit(1);
    await expect(deleteGroup(db(), owner, kitchen!.id)).rejects.toBeInstanceOf(SubcategoryFormError);
  });

  it("shows an article filed under a topic on that topic only, and matches unfiled articles by title", async () => {
    const plates = await getPublicSubcategory(db(), "kitchen", "plates-bowls-and-servingware");
    const drawers = await getPublicSubcategory(db(), "kitchen", "kitchen-drawers-and-cutlery");
    const spice = await getPublicSubcategory(db(), "kitchen", "spice-and-dabba-storage");
    const groupId = plates!.groupId;
    await insertGuide(
      db(),
      owner.id,
      guideContent({
        slug: "plates-and-cutlery-ideas",
        title: "Plates & Cutlery Ideas for Small Indian Kitchens",
        subcategoryGroupId: groupId,
        subcategoryId: plates!.id,
      }),
      { published: true },
    );
    await insertGuide(
      db(),
      owner.id,
      guideContent({
        slug: "cutlery-drawer-ideas",
        title: "Cutlery Drawer Ideas for Small Kitchens",
        subcategoryGroupId: groupId,
      }),
      { published: true },
    );

    const onPlates = await listTopicGuides(db(), plates!);
    const onDrawers = await listTopicGuides(db(), drawers!);
    expect(onPlates.map((guide) => guide.slug)).toEqual(["plates-and-cutlery-ideas"]);
    expect(onDrawers.map((guide) => guide.slug)).toEqual(["cutlery-drawer-ideas"]);

    await expect(
      createGuide(
        db(),
        owner,
        guideContent({ slug: "topic-from-another-section", subcategoryGroupId: groupId, subcategoryId: spice!.id }),
      ),
    ).rejects.toBeInstanceOf(GuideFormError);
  });

  it("gives an article breadcrumbs for its subcategory and, when chosen, its topic", async () => {
    const plates = await getPublicSubcategory(db(), "kitchen", "plates-bowls-and-servingware");
    const filed = { category: "kitchen" as const, subcategoryGroupId: plates!.groupId };
    expect(await guideSection(db(), { ...filed, subcategoryId: plates!.id })).toEqual([
      { name: "Utensils and Kitchen Essentials", href: "/categories/kitchen/utensils-and-kitchen-essentials" },
      { name: "Plates, Bowls and Servingware", href: "/categories/kitchen/plates-bowls-and-servingware" },
    ]);
    expect(await guideSection(db(), { ...filed, subcategoryId: null })).toEqual([
      { name: "Utensils and Kitchen Essentials", href: "/categories/kitchen/utensils-and-kitchen-essentials" },
    ]);
    expect(
      await guideSection(db(), { category: "kitchen", subcategoryId: null, subcategoryGroupId: null }),
    ).toEqual([]);
  });
});
