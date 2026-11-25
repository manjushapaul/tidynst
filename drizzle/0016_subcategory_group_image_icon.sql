ALTER TABLE "subcategory_groups" ADD COLUMN "icon_media_id" uuid;--> statement-breakpoint
ALTER TABLE "subcategory_groups" ADD CONSTRAINT "subcategory_groups_icon_media_id_media_assets_id_fk" FOREIGN KEY ("icon_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategory_groups" DROP COLUMN "icon";