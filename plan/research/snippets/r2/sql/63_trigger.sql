
create or replace function enforce_week_day_exclusivity() returns trigger as $$
begin
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

create trigger trg_week_day_exclusivity
  before insert or update on allocations
  for each row execute function enforce_week_day_exclusivity();
