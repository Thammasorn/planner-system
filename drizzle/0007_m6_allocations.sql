CREATE TYPE "public"."granularity" AS ENUM('WEEK', 'DAY');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_assignment_id" uuid NOT NULL,
	"granularity" "granularity" NOT NULL,
	"period_start" date NOT NULL,
	"week_start" date NOT NULL,
	"person_days" numeric(4, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_ta_granularity_period_key" UNIQUE("task_assignment_id","granularity","period_start"),
	CONSTRAINT "allocations_person_days_check" CHECK ("allocations"."person_days" > 0),
	CONSTRAINT "allocations_week_start_check" CHECK (extract(isodow from "allocations"."week_start") = 1),
	CONSTRAINT "allocations_period_check" CHECK (("allocations"."granularity" = 'WEEK' and "allocations"."period_start" = "allocations"."week_start" and "allocations"."person_days" <= 7) or
      ("allocations"."granularity" = 'DAY' and "allocations"."period_start" >= "allocations"."week_start" and "allocations"."period_start" < "allocations"."week_start" + 7 and "allocations"."person_days" <= 1))
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_task_assignment_id_task_assignments_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_week_start_ta_idx" ON "allocations" USING btree ("week_start","task_assignment_id");--> statement-breakpoint
CREATE INDEX "allocations_ta_week_start_idx" ON "allocations" USING btree ("task_assignment_id","week_start");