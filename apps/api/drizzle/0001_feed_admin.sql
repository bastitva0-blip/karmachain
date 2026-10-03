CREATE TABLE "endorsements" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"signature" text NOT NULL,
	"weight" real NOT NULL,
	"endorser_tier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"analysis_id" text,
	"token_id" text,
	"signal" text NOT NULL,
	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text,
	"revoke_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"proofs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_id" text,
	"repost_of" text,
	"hiring" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "job_specs" ADD COLUMN "recruiter_key" text;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "endorse_once" ON "endorsements" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "posts_created" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_parent" ON "posts" USING btree ("parent_id");