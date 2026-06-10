ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "entrypoints" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "match_rules" text;
