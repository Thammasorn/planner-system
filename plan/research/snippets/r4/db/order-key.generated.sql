CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"position" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tasks_project_parent_position_idx" ON "tasks" USING btree ("project_id","parent_id","position");