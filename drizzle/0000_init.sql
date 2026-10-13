CREATE TYPE "public"."guide_category" AS ENUM('kitchen', 'bathroom', 'bedroom-wardrobe', 'small-apartments', 'renters');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('not_requested', 'in_review', 'changes_requested', 'approved');--> statement-breakpoint
CREATE TYPE "public"."revision_reason" AS ENUM('created', 'saved', 'restored');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'editor', 'author');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_products" (
	"guide_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"note" text,
	CONSTRAINT "guide_products_guide_id_product_id_pk" PRIMARY KEY("guide_id","product_id"),
	CONSTRAINT "guide_products_position_key" UNIQUE("guide_id","position")
);
--> statement-breakpoint
CREATE TABLE "guide_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"body" text NOT NULL,
	"category" "guide_category",
	"topic_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"featured_image_id" uuid,
	"featured_image_alt" text,
	"content_hash" text NOT NULL,
	"reason" "revision_reason" NOT NULL,
	"restored_from_revision_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_revisions_number_key" UNIQUE("guide_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "guide_topics" (
	"guide_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "guide_topics_guide_id_topic_id_pk" PRIMARY KEY("guide_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category" "guide_category",
	"seo_title" text,
	"seo_description" text,
	"featured_image_id" uuid,
	"featured_image_alt" text,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"review_state" "review_state" DEFAULT 'not_requested' NOT NULL,
	"approved_content_hash" text,
	"current_revision_id" uuid,
	"published_revision_id" uuid,
	"first_published_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guides_slug_format" CHECK ("guides"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "guides_title_length" CHECK (char_length("guides"."title") between 3 and 140),
	CONSTRAINT "guides_published_consistency" CHECK (("guides"."published_revision_id" is null) = ("guides"."published_at" is null) and ("guides"."published_at" is null or "guides"."first_published_at" is not null)),
	CONSTRAINT "guides_approval_consistency" CHECK (("guides"."review_state" = 'approved') = ("guides"."approved_content_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"alt_text" text NOT NULL,
	"credit" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_content_type" CHECK ("media_assets"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
	CONSTRAINT "media_assets_byte_size" CHECK ("media_assets"."byte_size" > 0 and "media_assets"."byte_size" <= 5242880),
	CONSTRAINT "media_assets_dimensions" CHECK ("media_assets"."width" between 1 and 10000 and "media_assets"."height" between 1 and 10000),
	CONSTRAINT "media_assets_alt_length" CHECK (char_length("media_assets"."alt_text") between 5 and 200)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"summary" text NOT NULL,
	"merchant_name" text,
	"product_url" text,
	"verified_on" date,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "products_url_https" CHECK ("products"."product_url" is null or "products"."product_url" ~ '^https://'),
	CONSTRAINT "products_active_verified" CHECK ("products"."status" <> 'active' or "products"."verified_on" is not null)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_limit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bucket" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_format" CHECK ("topics"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "topics_name_length" CHECK (char_length("topics"."name") between 2 and 60)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_name_length" CHECK (char_length("users"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_products" ADD CONSTRAINT "guide_products_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_products" ADD CONSTRAINT "guide_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_reviews" ADD CONSTRAINT "guide_reviews_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_reviews" ADD CONSTRAINT "guide_reviews_revision_id_guide_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."guide_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_reviews" ADD CONSTRAINT "guide_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_featured_image_id_media_assets_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_topics" ADD CONSTRAINT "guide_topics_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_topics" ADD CONSTRAINT "guide_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_featured_image_id_media_assets_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_current_revision_id_guide_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."guide_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_published_revision_id_guide_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."guide_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "guide_products_product_idx" ON "guide_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "guide_reviews_guide_idx" ON "guide_reviews" USING btree ("guide_id","created_at");--> statement-breakpoint
CREATE INDEX "guide_revisions_guide_idx" ON "guide_revisions" USING btree ("guide_id","created_at");--> statement-breakpoint
CREATE INDEX "guide_revisions_search_idx" ON "guide_revisions" USING gin (to_tsvector('english', "title" || ' ' || "excerpt" || ' ' || "body"));--> statement-breakpoint
CREATE INDEX "guide_topics_topic_idx" ON "guide_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guides_slug_key" ON "guides" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "guides_published_idx" ON "guides" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_sha256_key" ON "media_assets" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "rate_limit_events_bucket_created_idx" ON "rate_limit_events" USING btree ("bucket","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_slug_key" ON "topics" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");