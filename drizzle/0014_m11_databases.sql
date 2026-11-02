CREATE TYPE "public"."db_column_type" AS ENUM('TITLE', 'TEXT', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'DATE', 'CHECKBOX', 'PERSON', 'URL');--> statement-breakpoint
CREATE TYPE "public"."db_view_type" AS ENUM('TABLE', 'KANBAN', 'CALENDAR');--> statement-breakpoint
ALTER TYPE "public"."page_kind" ADD VALUE 'DB_ROW';--> statement-breakpoint
CREATE TABLE "database_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"type" "db_column_type" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "database_columns_name_len" CHECK (length(trim("database_columns"."name")) between 1 and 100),
	CONSTRAINT "database_columns_title_not_deleted" CHECK ("database_columns"."type" <> 'TITLE' or "database_columns"."deleted_at" is null)
);
--> statement-breakpoint
CREATE TABLE "database_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"cells" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "database_rows_title_len" CHECK (length("database_rows"."title") <= 500),
	CONSTRAINT "database_rows_cells_object" CHECK (jsonb_typeof("database_rows"."cells") = 'object')
);
--> statement-breakpoint
CREATE TABLE "database_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"type" "db_view_type" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_batch" uuid,
	CONSTRAINT "database_views_name_len" CHECK (length(trim("database_views"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"detached_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "databases_title_len" CHECK (length("databases"."title") <= 200)
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "database_row_id" uuid;--> statement-breakpoint
ALTER TABLE "database_columns" ADD CONSTRAINT "database_columns_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_rows" ADD CONSTRAINT "database_rows_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_rows" ADD CONSTRAINT "database_rows_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_rows" ADD CONSTRAINT "database_rows_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "database_columns_one_title" ON "database_columns" USING btree ("database_id") WHERE "database_columns"."type" = 'TITLE';--> statement-breakpoint
CREATE INDEX "database_columns_db_pos_idx" ON "database_columns" USING btree ("database_id","position") WHERE "database_columns"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "database_columns_batch_idx" ON "database_columns" USING btree ("deleted_batch") WHERE "database_columns"."deleted_batch" is not null;--> statement-breakpoint
CREATE INDEX "database_rows_db_pos_idx" ON "database_rows" USING btree ("database_id","position") WHERE "database_rows"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "database_rows_title_trgm" ON "database_rows" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "database_rows_batch_idx" ON "database_rows" USING btree ("deleted_batch") WHERE "database_rows"."deleted_batch" is not null;--> statement-breakpoint
CREATE INDEX "database_views_db_pos_idx" ON "database_views" USING btree ("database_id","position") WHERE "database_views"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "database_views_batch_idx" ON "database_views" USING btree ("deleted_batch") WHERE "database_views"."deleted_batch" is not null;--> statement-breakpoint
CREATE INDEX "databases_page_id_idx" ON "databases" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "databases_title_trgm" ON "databases" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_database_row_id_database_rows_id_fk" FOREIGN KEY ("database_row_id") REFERENCES "public"."database_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_database_row_id_unique" ON "pages" USING btree ("database_row_id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_kind_row" CHECK (("pages"."kind"::text = 'DB_ROW') = ("pages"."database_row_id" is not null));