ALTER TABLE "guides" ADD COLUMN "featured_image_style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD COLUMN "featured_image_style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_featured_image_style_object" CHECK (jsonb_typeof("guides"."featured_image_style") = 'object');--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_featured_image_style_object" CHECK (jsonb_typeof("guide_revisions"."featured_image_style") = 'object');
