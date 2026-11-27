CREATE TABLE "auth_identities" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"provider_refresh_enc" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_device_id" text NOT NULL,
	"attest_key_id" text,
	"public_key" "bytea",
	"counter" bigint DEFAULT 0 NOT NULL,
	"risk_flag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"refresh_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"session_key_enc" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"kms_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"home_region" text NOT NULL,
	"email_hash" text,
	"email_enc" "bytea",
	"status" text DEFAULT 'active' NOT NULL,
	"billing_tz" text NOT NULL,
	"billing_tz_changed_at" timestamp with time zone,
	"age_confirmed_at" timestamp with time zone,
	"support_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_identities_user" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_attest_key_id" ON "devices" USING btree ("attest_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_client_device" ON "devices" USING btree ("user_id","client_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_hash" ON "sessions" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_family" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_hash" ON "users" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_support_code" ON "users" USING btree ("support_code");