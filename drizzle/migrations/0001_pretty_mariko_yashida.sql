ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "enabled_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "enable_duration_minutes" integer;
