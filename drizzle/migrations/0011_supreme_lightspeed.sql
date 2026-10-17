CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"owner_tag" varchar(64) DEFAULT 'harness' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "target_ip" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "edge" varchar(64);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "owner_tag" varchar(64);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "created_by_token_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "share_hostname" varchar(255);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "share_auth_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "owner_labels" jsonb;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_token_id_api_tokens_id_fk" FOREIGN KEY ("created_by_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_services_owner_tag" ON "services" USING btree ("owner_tag");--> statement-breakpoint
CREATE INDEX "idx_services_expires_at" ON "services" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_services_share_hostname" ON "services" USING btree ("share_hostname") WHERE "services"."share_hostname" IS NOT NULL;