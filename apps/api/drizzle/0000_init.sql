CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"skill" text NOT NULL,
	"tier" text NOT NULL,
	"score" integer NOT NULL,
	"source" text NOT NULL,
	"verified" boolean NOT NULL,
	"evidence_json" jsonb NOT NULL,
	"evidence_hash" text NOT NULL,
	"repo_fingerprint" text NOT NULL,
	"token_id" text,
	"mint_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"verify_code" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"extracted_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" text PRIMARY KEY NOT NULL,
	"job_spec_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"conversation_id" text,
	"mode" text DEFAULT 'voice' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"plan_json" jsonb NOT NULL,
	"transcript_json" jsonb,
	"report_json" jsonb,
	"report_hash" text,
	"attestation_uid" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_specs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"spec_json" jsonb NOT NULL,
	"style_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"skills_json" jsonb NOT NULL,
	"embedding" jsonb,
	"external_validation" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"enc_github_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" text PRIMARY KEY NOT NULL,
	"dev_user_id" text NOT NULL,
	"client_address" text NOT NULL,
	"audio_transcript" text NOT NULL,
	"structured_json" jsonb NOT NULL,
	"attestation_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"github_id" text NOT NULL,
	"github_handle" text NOT NULL,
	"avatar_url" text,
	"name" text,
	"github_created_at" timestamp with time zone,
	"wallet_address" text,
	"consent_searchable" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "wallet_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestions" ADD CONSTRAINT "ingestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_spec_id_job_specs_id_fk" FOREIGN KEY ("job_spec_id") REFERENCES "public"."job_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_dev_user_id_users_id_fk" FOREIGN KEY ("dev_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_nonces" ADD CONSTRAINT "wallet_nonces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_cache" ON "analyses" USING btree ("user_id","skill","repo_fingerprint");--> statement-breakpoint
CREATE INDEX "analyses_hash" ON "analyses" USING btree ("evidence_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower" ON "users" USING btree (lower("github_handle"));