-- Custom SQL migration: SPEC §6.2 exclusion (needs btree_gist from 0000_extensions). Name pinned for error mapping/tests.
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("deleted_at" IS NULL);
