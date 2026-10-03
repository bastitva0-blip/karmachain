CREATE TABLE "vakh_kv" (
	"key" text PRIMARY KEY NOT NULL,
	"enc_value" text NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "vakh_post_id" text;