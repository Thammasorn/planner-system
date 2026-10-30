\set VERBOSITY terse
begin;
alter table time_off drop constraint time_off_user_id_daterange_excl;
alter table time_off add constraint time_off_no_overlap exclude using gist (
  user_id with =,
  daterange(start_date, end_date, '[]') with &&,
  (case half when 'AM' then int4range(0,1) when 'PM' then int4range(1,2) else int4range(0,2) end) with &&
) where (deleted_at is null);
\echo 'PM on same day as existing AM (expect OK):'
insert into time_off(user_id,leave_type_id,start_date,end_date,half,created_by)
 select 'u_mix',id,'2026-10-20','2026-10-20','PM','u_mix' from leave_types where name='ลาพักร้อน' returning half;
\echo 'second AM same day (expect 23P01):'
savepoint s1;
insert into time_off(user_id,leave_type_id,start_date,end_date,half,created_by)
 select 'u_mix',id,'2026-10-20','2026-10-20','AM','u_mix' from leave_types where name='ลาพักร้อน';
rollback to s1;
\echo 'full day overlapping half days (expect 23P01):'
savepoint s2;
insert into time_off(user_id,leave_type_id,start_date,end_date,created_by)
 select 'u_mix',id,'2026-10-19','2026-10-21','u_mix' from leave_types where name='ลาพักร้อน';
rollback to s2;
rollback;
select count(*) as mint_1020_rows_after_rollback from time_off where user_id='u_mix' and start_date='2026-10-20';
