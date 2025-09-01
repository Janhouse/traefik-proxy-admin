ALTER TABLE "services" ADD COLUMN "enabled_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "enable_duration_minutes" integer;