-- Custom SQL migration: things drizzle-kit cannot express (SPEC §6.2 exclusion, §6.3 trigger)
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("deleted_at" IS NULL);--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_week_day_exclusivity() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM task_assignments WHERE id = NEW.task_assignment_id FOR NO KEY UPDATE;
  IF EXISTS (
    SELECT 1 FROM allocations
    WHERE task_assignment_id = NEW.task_assignment_id
      AND week_start = NEW.week_start
      AND granularity <> NEW.granularity
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'WEEK_DAY_CONFLICT: assignment % week %', NEW.task_assignment_id, NEW.week_start
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trg_week_day_exclusivity
  BEFORE INSERT OR UPDATE ON allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_week_day_exclusivity();
