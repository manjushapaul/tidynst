CREATE TYPE "public"."contact_topic" AS ENUM('question', 'correction', 'suggestion');--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"topic" "contact_topic" NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp with time zone,
	"last_replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_messages_name_length" CHECK (char_length("contact_messages"."name") between 1 and 80),
	CONSTRAINT "contact_messages_email_length" CHECK (char_length("contact_messages"."email") between 3 and 254),
	CONSTRAINT "contact_messages_message_length" CHECK (char_length("contact_messages"."message") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "contact_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_replies_body_length" CHECK (char_length("contact_replies"."body") between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "contact_replies" ADD CONSTRAINT "contact_replies_message_id_contact_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."contact_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_replies" ADD CONSTRAINT "contact_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_replies_message_idx" ON "contact_replies" USING btree ("message_id","created_at");
