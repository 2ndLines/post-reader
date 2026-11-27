CREATE TABLE "quota_balances" (
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"granted_mc" bigint NOT NULL,
	"used_mc" bigint DEFAULT 0 NOT NULL,
	"rate_version" text NOT NULL,
	CONSTRAINT "quota_balances_user_id_period_start_pk" PRIMARY KEY("user_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "quota_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"delta_mc" bigint NOT NULL,
	"reason" text NOT NULL,
	"usage_id" uuid,
	"rate_version" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "quota_ledger_reason" CHECK ("quota_ledger"."reason" in ('grant','debit','refund','compensation'))
);
--> statement-breakpoint
CREATE TABLE "vendor_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"job_id" uuid,
	"stage" text NOT NULL,
	"seq" bigint NOT NULL,
	"channel" text NOT NULL,
	"failover_from" text,
	"price_version" text NOT NULL,
	"cost_micros" bigint NOT NULL,
	"billable" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_usage_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "vendor_usage_items" (
	"usage_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"qty" numeric NOT NULL,
	CONSTRAINT "vendor_usage_items_usage_id_unit_pk" PRIMARY KEY("usage_id","unit"),
	CONSTRAINT "vendor_usage_items_unit" CHECK ("vendor_usage_items"."unit" in ('in_tokens','out_tokens','cached_in_tokens','chars_10k','speech_tokens','audio_s'))
);
--> statement-breakpoint
ALTER TABLE "quota_balances" ADD CONSTRAINT "quota_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_usage_id_vendor_usage_id_fk" FOREIGN KEY ("usage_id") REFERENCES "public"."vendor_usage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_usage_items" ADD CONSTRAINT "vendor_usage_items_usage_id_vendor_usage_id_fk" FOREIGN KEY ("usage_id") REFERENCES "public"."vendor_usage"("id") ON DELETE cascade ON UPDATE no action;