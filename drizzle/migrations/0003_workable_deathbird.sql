CREATE TABLE IF NOT EXISTS "service_security_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"security_type" varchar(50) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_basic_auth_config_id_basic_auth_configs_id_fk";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "service_security_configs" ADD CONSTRAINT "service_security_configs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN IF EXISTS "auth_method";--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN IF EXISTS "sso_groups";--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN IF EXISTS "sso_users";--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN IF EXISTS "basic_auth_config_id";
