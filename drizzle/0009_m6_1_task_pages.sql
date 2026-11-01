CREATE TYPE "public"."page_kind" AS ENUM('DOC', 'TASK');--> statement-breakpoint
DROP INDEX "pages_tree_idx";--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "kind" "page_kind" DEFAULT 'DOC' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "full_width" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_task_id_unique" ON "pages" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "pages_tree_idx" ON "pages" USING btree ("space","project_id","parent_id","position") WHERE "pages"."deleted_at" is null and "pages"."kind" = 'DOC';--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_kind_task" CHECK (("pages"."kind" = 'TASK') = ("pages"."task_id" is not null));--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_kind_shape" CHECK ("pages"."kind" = 'DOC' or ("pages"."parent_id" is null and "pages"."depth" = 0 and not "pages"."is_charter" and not "pages"."locked" and "pages"."title" = ''));--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_task_space" CHECK ("pages"."kind" <> 'TASK' or "pages"."space" = 'PROJECT');