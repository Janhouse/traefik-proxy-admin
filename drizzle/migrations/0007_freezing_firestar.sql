ALTER TABLE "services" ALTER COLUMN "subdomain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "certificate_configs" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "hostname_mode" varchar(20) DEFAULT 'subdomain' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "custom_hostnames" text;