INSERT INTO "subcategory_groups" ("category", "slug", "name", "description", "position") VALUES
  ('bathroom', 'shelves-and-corner-storage', 'Shelves and corner storage', 'Corner shelves and wall storage that stay usable in a small tiled bathroom.', 0),
  ('bathroom', 'hooks-and-towel-space', 'Hooks and towel space', 'Hooks and a clear place for towels that stay easy to reach after a shower.', 1),
  ('bathroom', 'wet-area-considerations', 'Wet-area considerations', 'Storage that copes with water, humidity and daily cleaning in a wet bathroom.', 2),
  ('bathroom', 'toiletries-and-cleaning-supplies', 'Toiletries and cleaning supplies', 'A home for daily toiletries and cleaning supplies without crowding the sink.', 3),
  ('bedroom-wardrobe', 'wardrobes-and-almirahs', 'Wardrobes and almirahs', 'Folding, hanging and shelf space inside wardrobes and steel almirahs.', 0),
  ('bedroom-wardrobe', 'saree-and-occasion-wear-storage', 'Saree and occasion-wear storage', 'A careful place for sarees, lehengas and other occasion wear.', 1),
  ('bedroom-wardrobe', 'seasonal-and-bedding-storage', 'Seasonal and bedding storage', 'Where seasonal clothes and extra bedding go when they are not in use.', 2),
  ('bedroom-wardrobe', 'under-bed-space', 'Under-bed space', 'Using the space under the bed for clothes, linen and things used less often.', 3),
  ('small-apartments', 'entryways-and-shoe-storage', 'Entryways and shoe storage', 'A landing spot for shoes, bags and keys in a small apartment entry.', 0),
  ('small-apartments', 'living-and-dining-spaces', 'Living and dining spaces', 'Storage that keeps a living or dining area clear when the room does more than one job.', 1),
  ('small-apartments', 'balconies-and-utility-areas', 'Balconies and utility areas', 'Practical storage for a balcony, utility corner or compact service area.', 2),
  ('small-apartments', 'work-from-home-corners', 'Work-from-home corners', 'A work corner that can be set up and put away in a small apartment.', 3),
  ('renters', 'no-drill-and-removable-storage', 'No-drill and removable storage', 'Storage that goes up and comes down without drilling into rented walls.', 0),
  ('renters', 'portable-furniture', 'Portable furniture', 'Furniture and organisers you can move with you when the lease ends.', 1),
  ('renters', 'protecting-walls-and-fittings', 'Protecting walls and fittings', 'Ways to organise while keeping walls, floors and fittings free of damage.', 2),
  ('renters', 'moving-friendly-setups', 'Moving-friendly setups', 'Setups that pack down cleanly so a rented home is easy to leave.', 3);--> statement-breakpoint
INSERT INTO "subcategories" ("group_id", "category", "slug", "name", "position")
SELECT g.id, g.category, g.slug, g.name, 0
FROM "subcategory_groups" g
WHERE g.category <> 'kitchen';
