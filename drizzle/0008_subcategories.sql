CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"category" "guide_category" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcategories_category_slug" UNIQUE("category","slug"),
	CONSTRAINT "subcategories_group_name" UNIQUE("group_id","name"),
	CONSTRAINT "subcategories_slug_format" CHECK ("subcategories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "subcategories_name_length" CHECK (char_length("subcategories"."name") between 2 and 80),
	CONSTRAINT "subcategories_position_nonneg" CHECK ("subcategories"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subcategory_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "guide_category" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcategory_groups_category_name" UNIQUE("category","name"),
	CONSTRAINT "subcategory_groups_name_length" CHECK (char_length("subcategory_groups"."name") between 2 and 80),
	CONSTRAINT "subcategory_groups_description_length" CHECK (char_length("subcategory_groups"."description") between 20 and 300),
	CONSTRAINT "subcategory_groups_position_nonneg" CHECK ("subcategory_groups"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_group_id_subcategory_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."subcategory_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subcategories_group_idx" ON "subcategories" USING btree ("group_id","position");--> statement-breakpoint
CREATE INDEX "subcategory_groups_category_idx" ON "subcategory_groups" USING btree ("category","position");--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_revisions_subcategory_idx" ON "guide_revisions" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "guides_subcategory_idx" ON "guides" USING btree ("subcategory_id");--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_subcategory_category" CHECK ("guide_revisions"."subcategory_id" is null or "guide_revisions"."category" is not null);--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_subcategory_category" CHECK ("guides"."subcategory_id" is null or "guides"."category" is not null);--> statement-breakpoint
INSERT INTO "subcategory_groups" ("category", "name", "description", "position") VALUES
  ('kitchen', 'Food and Grocery Storage', 'Organising ingredients, groceries and everyday cooking essentials.', 0),
  ('kitchen', 'Utensils and Kitchen Essentials', 'Making cookware, utensils and daily-use items easy to access.', 1),
  ('kitchen', 'Counters and Space-Saving Storage', 'Reducing clutter and making the most of limited kitchen space.', 2),
  ('kitchen', 'Kitchen Cleaning and Waste Management', 'Keeping washing, cleaning and waste-handling routines tidy.', 3),
  ('kitchen', 'Kitchen Routines and Smart Organisation', 'Practical systems for cooking, meal preparation and maintaining order.', 4);--> statement-breakpoint
INSERT INTO "subcategories" ("group_id", "category", "slug", "name", "position")
SELECT g.id, 'kitchen'::"guide_category", v.slug, v.name, v.position
FROM (VALUES
  ('Food and Grocery Storage', 'spice-and-dabba-storage', 'Spice and Dabba Storage', 0),
  ('Food and Grocery Storage', 'fridge-and-pantry', 'Fridge and Pantry', 1),
  ('Food and Grocery Storage', 'groceries-and-bulk-buying', 'Groceries and Bulk Buying', 2),
  ('Food and Grocery Storage', 'grains-pulses-and-flour-storage', 'Grains, Pulses and Flour Storage', 3),
  ('Food and Grocery Storage', 'oil-sauces-and-condiment-storage', 'Oil, Sauces and Condiment Storage', 4),
  ('Food and Grocery Storage', 'snacks-and-dry-food-storage', 'Snacks and Dry Food Storage', 5),
  ('Utensils and Kitchen Essentials', 'pots-pans-and-lids', 'Pots, Pans and Lids', 0),
  ('Utensils and Kitchen Essentials', 'plates-bowls-and-servingware', 'Plates, Bowls and Servingware', 1),
  ('Utensils and Kitchen Essentials', 'kitchen-drawers-and-cutlery', 'Kitchen Drawers and Cutlery', 2),
  ('Utensils and Kitchen Essentials', 'cooking-tools-and-utensils', 'Cooking Tools and Utensils', 3),
  ('Utensils and Kitchen Essentials', 'lunch-boxes-and-water-bottles', 'Lunch Boxes and Water Bottles', 4),
  ('Utensils and Kitchen Essentials', 'kitchen-appliances-and-cords', 'Kitchen Appliances and Cords', 5),
  ('Counters and Space-Saving Storage', 'counters-and-platforms', 'Counters and Platforms', 0),
  ('Counters and Space-Saving Storage', 'cabinets-and-under-sink-space', 'Cabinets and Under-Sink Space', 1),
  ('Counters and Space-Saving Storage', 'vertical-and-wall-mounted-storage', 'Vertical and Wall-Mounted Storage', 2),
  ('Counters and Space-Saving Storage', 'corner-and-narrow-gap-storage', 'Corner and Narrow-Gap Storage', 3),
  ('Counters and Space-Saving Storage', 'kitchen-trolleys-and-rolling-carts', 'Kitchen Trolleys and Rolling Carts', 4),
  ('Counters and Space-Saving Storage', 'small-kitchen-layouts-and-work-zones', 'Small Kitchen Layouts and Work Zones', 5),
  ('Kitchen Cleaning and Waste Management', 'sink-and-dishwashing-organisation', 'Sink and Dishwashing Organisation', 0),
  ('Kitchen Cleaning and Waste Management', 'dish-racks-and-drying-space', 'Dish Racks and Drying Space', 1),
  ('Kitchen Cleaning and Waste Management', 'cleaning-supplies-and-tools', 'Cleaning Supplies and Tools', 2),
  ('Kitchen Cleaning and Waste Management', 'under-sink-cleaning-storage', 'Under-Sink Cleaning Storage', 3),
  ('Kitchen Cleaning and Waste Management', 'dustbins-and-waste-sorting', 'Dustbins and Waste Sorting', 4),
  ('Kitchen Cleaning and Waste Management', 'kitchen-cloths-sponges-and-scrubbers', 'Kitchen Cloths, Sponges and Scrubbers', 5),
  ('Kitchen Routines and Smart Organisation', 'daily-cooking-and-meal-prep-zones', 'Daily Cooking and Meal-Prep Zones', 0),
  ('Kitchen Routines and Smart Organisation', 'meal-planning-and-kitchen-readiness', 'Meal Planning and Kitchen Readiness', 1),
  ('Kitchen Routines and Smart Organisation', 'small-kitchen-organisation-routines', 'Small Kitchen Organisation Routines', 2),
  ('Kitchen Routines and Smart Organisation', 'decluttering-and-storage-maintenance', 'Decluttering and Storage Maintenance', 3),
  ('Kitchen Routines and Smart Organisation', 'rental-friendly-kitchen-organisation', 'Rental-Friendly Kitchen Organisation', 4),
  ('Kitchen Routines and Smart Organisation', 'family-friendly-and-child-safe-storage', 'Family-Friendly and Child-Safe Storage', 5)
) AS v(group_name, slug, name, position)
JOIN "subcategory_groups" g ON g.category = 'kitchen' AND g.name = v.group_name;