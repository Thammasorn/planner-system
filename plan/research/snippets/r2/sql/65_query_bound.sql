
select ta.user_id, a.week_start,
       sum(a.person_days) as total,
       sum(a.person_days) filter (where coalesce(
         t.certainty_override, p1.certainty_override, p2.certainty_override, pr.certainty
       ) = 'CONFIRMED') as committed
from allocations a
join task_assignments ta on ta.id = a.task_assignment_id and ta.deleted_at is null
join tasks t             on t.id  = ta.task_id          and t.deleted_at  is null
left join tasks p1       on p1.id = t.parent_id
left join tasks p2       on p2.id = p1.parent_id
join projects pr         on pr.id = t.project_id
                        and pr.deleted_at is null and pr.archived_at is null
where a.week_start >= '2026-10-05'::date and a.week_start < '2026-10-26'::date
  and (t.completed_week is null or a.week_start <= t.completed_week)
group by ta.user_id, a.week_start
order by 1,2;
