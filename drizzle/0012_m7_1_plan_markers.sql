CREATE TYPE "public"."plan_marker_color" AS ENUM('RED', 'YELLOW', 'GREEN');--> statement-breakpoint
CREATE TABLE "plan_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"color" "plan_marker_color" DEFAULT 'RED' NOT NULL,
	"label" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "plan_markers_label_check" CHECK ("plan_markers"."label" is null or length(trim("plan_markers"."label")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "plan_markers" ADD CONSTRAINT "plan_markers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_markers" ADD CONSTRAINT "plan_markers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_markers_project_id_date_idx" ON "plan_markers" USING btree ("project_id","date") WHERE "plan_markers"."deleted_at" is null;