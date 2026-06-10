ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "insecure_skip_verify" boolean DEFAULT false NOT NULL;
