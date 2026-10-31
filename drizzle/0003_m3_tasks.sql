CREATE TYPE "public"."task_status_category" AS ENUM('TODO', 'IN_PROGRESS', 'WAITING', 'DONE');--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "task_blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"blocker_task_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "task_blockers_not_self" CHECK ("task_blockers"."task_id" <> "task_blockers"."blocker_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#94A3B8' NOT NULL,
	"category" "task_status_category" NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "task_statuses_project_id_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "task_statuses_name_check" CHECK (length(trim("task_statuses"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"depth" smallint DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"start_date" date,
	"due_date" date,
	"certainty_override" "certainty",
	"status_id" uuid NOT NULL,
	"completed_on" date,
	"completed_week" date GENERATED ALWAYS AS ((date_trunc('week', completed_on::timestamp)::date)) STORED,
	"completed_by" text,
	"position" text COLLATE "C" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "tasks_project_id_id_key" UNIQUE("project_id","id"),
	CONSTRAINT "tasks_depth_check" CHECK ("tasks"."depth" between 0 and 2),
	CONSTRAINT "tasks_name_check" CHECK (length(trim("tasks"."name")) > 0),
	CONSTRAINT "tasks_dates_check" CHECK ("tasks"."due_date" is null or "tasks"."start_date" is null or "tasks"."due_date" >= "tasks"."start_date")
);
--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_task_fk" FOREIGN KEY ("project_id","task_id") REFERENCES "public"."tasks"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_blocker_fk" FOREIGN KEY ("project_id","blocker_task_id") REFERENCES "public"."tasks"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_fk" FOREIGN KEY ("project_id","status_id") REFERENCES "public"."task_statuses"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignments_active" ON "task_assignments" USING btree ("task_id","user_id") WHERE "task_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_assignments_user_id_idx" ON "task_assignments" USING btree ("user_id") WHERE "task_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "task_blockers_active" ON "task_blockers" USING btree ("task_id","blocker_task_id") WHERE "task_blockers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_blockers_blocker_task_id_idx" ON "task_blockers" USING btree ("blocker_task_id") WHERE "task_blockers"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "task_statuses_name" ON "task_statuses" USING btree ("project_id",lower("name")) WHERE "task_statuses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_statuses_project_id_position_idx" ON "task_statuses" USING btree ("project_id","position") WHERE "task_statuses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_project_id_parent_id_position_idx" ON "tasks" USING btree ("project_id","parent_id","position") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_name_trgm" ON "tasks" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_status_id_idx" ON "tasks" USING btree ("status_id") WHERE "tasks"."deleted_at" is null;