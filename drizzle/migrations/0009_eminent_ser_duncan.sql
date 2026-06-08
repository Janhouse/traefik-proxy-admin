CREATE TABLE "router_metric_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"service_id" uuid,
	"router" varchar(512) NOT NULL,
	"req_2xx" integer DEFAULT 0 NOT NULL,
	"req_3xx" integer DEFAULT 0 NOT NULL,
	"req_4xx" integer DEFAULT 0 NOT NULL,
	"req_5xx" integer DEFAULT 0 NOT NULL,
	"req_other" integer DEFAULT 0 NOT NULL,
	"dur_sum_ms" integer DEFAULT 0 NOT NULL,
	"dur_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "router_metric_samples" ADD CONSTRAINT "router_metric_samples_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_router_metric_samples_ts" ON "router_metric_samples" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "idx_router_metric_samples_service_ts" ON "router_metric_samples" USING btree ("service_id","ts");