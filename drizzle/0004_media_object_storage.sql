ALTER TABLE "media_assets" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_provider" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_url" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_backing" CHECK ((
        ("media_assets"."data" is not null and "media_assets"."storage_key" is null and "media_assets"."storage_url" is null and "media_assets"."storage_provider" is null)
        or
        ("media_assets"."data" is null and "media_assets"."storage_key" is not null and "media_assets"."storage_url" is not null and "media_assets"."storage_provider" is not null)
      ));--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_provider" CHECK ("media_assets"."storage_provider" is null or "media_assets"."storage_provider" in ('vercel_blob'));