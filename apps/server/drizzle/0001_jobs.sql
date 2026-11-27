CREATE TABLE "job_segments" (
	"job_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"unit_id" text NOT NULL,
	"object_key" text NOT NULL,
	"audio_sha256" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"cache_key" text,
	"scope" text NOT NULL,
	CONSTRAINT "job_segments_job_id_seq_pk" PRIMARY KEY("job_id","seq")
);
--> statement-breakpoint
CREATE TABLE "job_units" (
	"job_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" text,
	"position" integer NOT NULL,
	"clean_text_enc" "bytea",
	"client_hash" text NOT NULL,
	"server_text_sha256" text,
	"ord" integer,
	"emotion" text,
	"voice_slot" integer,
	"translated_enc" "bytea",
	CONSTRAINT "job_units_job_id_unit_id_pk" PRIMARY KEY("job_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"post_key" text NOT NULL,
	"cache_scope" text NOT NULL,
	"branch" text,
	"prefs" jsonb NOT NULL,
	"target_lang" text NOT NULL,
	"read_mode" text NOT NULL,
	"passthrough_langs" jsonb NOT NULL,
	"state" text NOT NULL,
	"degraded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
ALTER TABLE "job_segments" ADD CONSTRAINT "job_segments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_units" ADD CONSTRAINT "job_units_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_user_created" ON "jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_idem" ON "jobs" USING btree ("user_id","idempotency_key");