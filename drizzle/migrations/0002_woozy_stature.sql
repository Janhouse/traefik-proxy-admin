CREATE TABLE "basic_auth_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "basic_auth_configs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "basic_auth_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "basic_auth_config_id" uuid;--> statement-breakpoint
ALTER TABLE "basic_auth_users" ADD CONSTRAINT "basic_auth_users_config_id_basic_auth_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."basic_auth_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_basic_auth_config_id_basic_auth_configs_id_fk" FOREIGN KEY ("basic_auth_config_id") REFERENCES "public"."basic_auth_configs"("id") ON DELETE set null ON UPDATE no action;