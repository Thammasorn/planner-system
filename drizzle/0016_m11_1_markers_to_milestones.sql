-- M11.1 (owner 2026-11-02, SPEC v3.4 D24 reversed, M11.1-D2): every plan marker — live and soft-deleted — becomes a
-- milestone of the same project: same id, date and colour (RED/YELLOW/GREEN map 1:1), name = the trimmed label or
-- 'เส้นกำกับ' (= th.milestones.fromMarkerName) when there is none, no description, open (completed_on null), no task
-- binding; deleted_at / deleted_batch, created_by and timestamps are kept. plan_markers is dropped by 0017.
INSERT INTO "milestones" ("id", "project_id", "name", "date", "description", "completed_on", "color", "created_by", "created_at", "updated_at", "deleted_at", "deleted_batch")
SELECT
  pm."id",
  pm."project_id",
  coalesce(nullif(trim(pm."label"), ''), 'เส้นกำกับ'),
  pm."date",
  NULL,
  NULL,
  pm."color"::text::"milestone_color",
  pm."created_by",
  pm."created_at",
  pm."updated_at",
  pm."deleted_at",
  pm."deleted_batch"
FROM "plan_markers" pm
ON CONFLICT ("id") DO NOTHING;
