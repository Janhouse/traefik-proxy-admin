CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"description" text,
	"use_wildcard_cert" boolean DEFAULT true NOT NULL,
	"cert_resolver" varchar(255) DEFAULT 'letsencrypt' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "services_subdomain_unique";--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "domain_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;