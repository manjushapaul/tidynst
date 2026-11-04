ALTER TABLE "guides" ADD COLUMN "article_image_style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD COLUMN "article_image_style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_article_image_style_object" CHECK (jsonb_typeof("guides"."article_image_style") = 'object');--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_article_image_style_object" CHECK (jsonb_typeof("guide_revisions"."article_image_style") = 'object');
