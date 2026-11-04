CREATE TABLE "homepage_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homepage_settings_singleton" CHECK ("homepage_settings"."id" = 'site'),
	CONSTRAINT "homepage_settings_content_object" CHECK (jsonb_typeof("homepage_settings"."content") = 'object')
);
--> statement-breakpoint
ALTER TABLE "homepage_settings" ADD CONSTRAINT "homepage_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;