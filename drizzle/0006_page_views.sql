CREATE TABLE "page_views" (
	"path" text NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "page_views_path_day_pk" PRIMARY KEY("path","day"),
	CONSTRAINT "page_views_path_length" CHECK (char_length("page_views"."path") between 1 and 200),
	CONSTRAINT "page_views_path_shape" CHECK ("page_views"."path" = '/' or "page_views"."path" ~ '^(/[a-z0-9][a-z0-9_-]*)+$'),
	CONSTRAINT "page_views_path_public" CHECK ("page_views"."path" !~ '^/(admin|media|_next|og|page-view)(/|$)'),
	CONSTRAINT "page_views_count" CHECK ("page_views"."views" between 1 and 2000000000)
);
--> statement-breakpoint
CREATE INDEX "page_views_day_idx" ON "page_views" USING btree ("day");