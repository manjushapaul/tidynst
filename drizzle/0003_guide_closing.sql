DROP INDEX "guide_revisions_search_idx";--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD COLUMN "closing" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "closing" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "guide_revisions_search_idx" ON "guide_revisions" USING gin (to_tsvector('english', "title" || ' ' || "excerpt" || ' ' || "body" || ' ' || "closing"));