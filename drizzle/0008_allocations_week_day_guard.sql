-- Custom SQL migration: SPEC §6.3 BR-20b trigger + race-proof EXCLUDE backstop (M6-D5, r6b E9).
-- Needs btree_gist from 0000_extensions. Names pinned for error mapping/tests (P0001 WEEK_DAY_CONFLICT and 23P01 on
-- allocations_one_resolution_per_week both map to INTERNAL: every writer locks the assignment row first).
CREATE OR REPLACE FUNCTION enforce_week_day_exclusivity() RETURNS trigger AS $$
BEGIN
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
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_week_day_exclusivity BEFORE INSERT OR UPDATE ON allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_week_day_exclusivity();
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_one_resolution_per_week"
  EXCLUDE USING gist ("task_assignment_id" WITH =, "week_start" WITH =, "granularity" WITH <>);
