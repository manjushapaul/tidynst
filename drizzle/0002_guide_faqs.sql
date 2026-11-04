ALTER TABLE "guide_revisions" ADD COLUMN "faqs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "faqs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_faqs_array" CHECK (jsonb_typeof("guide_revisions"."faqs") = 'array');--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_faqs_array" CHECK (jsonb_typeof("guides"."faqs") = 'array');