ALTER TABLE "services" ALTER COLUMN "subdomain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "certificate_configs" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "hostname_mode" varchar(20) DEFAULT 'subdomain' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "custom_hostnames" text;
