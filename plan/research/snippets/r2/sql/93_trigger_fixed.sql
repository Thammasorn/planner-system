create or replace function enforce_week_day_exclusivity() returns trigger as $$
begin
  -- serialize concurrent writers of the same assignment (READ COMMITTED race fix)
  perform 1 from task_assignments where id = new.task_assignment_id for no key update;
  if exists (
    select 1 from allocations
    where task_assignment_id = new.task_assignment_id
      and week_start = new.week_start
      and granularity <> new.granularity
      and id <> new.id
  ) then
    raise exception 'WEEK_DAY_CONFLICT: assignment % week %', new.task_assignment_id, new.week_start
      using errcode = 'P0001';
  end if;
  return new;
end $$ language plpgsql;
delete from allocations where task_assignment_id='eeeeeeee-0000-0000-0000-000000000001' and week_start='2026-11-02';
