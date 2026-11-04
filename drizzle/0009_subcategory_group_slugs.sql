ALTER TABLE "subcategory_groups" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "subcategory_groups" SET "slug" = CASE "name"
  WHEN 'Food and Grocery Storage' THEN 'food-and-grocery-storage'
  WHEN 'Utensils and Kitchen Essentials' THEN 'utensils-and-kitchen-essentials'
  WHEN 'Counters and Space-Saving Storage' THEN 'counters-and-space-saving-storage'
  WHEN 'Kitchen Cleaning and Waste Management' THEN 'kitchen-cleaning-and-waste-management'
  WHEN 'Kitchen Routines and Smart Organisation' THEN 'kitchen-routines-and-smart-organisation'
  ELSE trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
END
WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "subcategory_groups" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategory_groups" ADD CONSTRAINT "subcategory_groups_category_slug" UNIQUE("category","slug");--> statement-breakpoint
ALTER TABLE "subcategory_groups" ADD CONSTRAINT "subcategory_groups_slug_format" CHECK ("subcategory_groups"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
