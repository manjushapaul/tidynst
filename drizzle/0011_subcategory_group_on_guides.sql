ALTER TABLE "guides" ADD COLUMN "subcategory_group_id" uuid;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD COLUMN "subcategory_group_id" uuid;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_subcategory_group_id_subcategory_groups_id_fk" FOREIGN KEY ("subcategory_group_id") REFERENCES "public"."subcategory_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_subcategory_group_id_subcategory_groups_id_fk" FOREIGN KEY ("subcategory_group_id") REFERENCES "public"."subcategory_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guides_subcategory_group_idx" ON "guides" USING btree ("subcategory_group_id");--> statement-breakpoint
CREATE INDEX "guide_revisions_subcategory_group_idx" ON "guide_revisions" USING btree ("subcategory_group_id");
