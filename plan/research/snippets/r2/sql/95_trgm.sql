select datname, datcollate, datctype, datlocprovider from pg_database where datname='planner';
select show_trgm('ย้ายข้อมูลลูกค้า') as trgm_full;
select show_trgm('ลูกค้า') as trgm_query;
select similarity('ย้ายข้อมูลลูกค้า','ลูกค้า') as sim, word_similarity('ลูกค้า','ย้ายข้อมูลลูกค้า') as word_sim, 'ย้ายข้อมูลลูกค้า' ilike '%ลูกค้า%' as ilike_hit;
insert into tasks(project_id,name,position,created_by)
 select '11111111-1111-1111-1111-111111111111', 'งานทดสอบ '||g||' '||(array['ย้ายข้อมูลลูกค้า','ออกแบบ flow ใหม่','ทำ dashboard ผู้บริหาร','ตั้งค่า automation'])[1+g%4], 'z'||g, 'u_mgr' from generate_series(1,3000) g;
analyze tasks;
set enable_seqscan = off;
explain (costs off) select id, name from tasks where name ilike '%ลูกค้า%';
select count(*) as hits_ilike from tasks where name ilike '%ลูกค้า%';
explain (costs off) select id, name from tasks where name ilike '%ข้อ%';
select count(*) as hits_short from tasks where name ilike '%ข้อ%';
explain (costs off) select id, name from tasks where name ilike '%dash%';
reset enable_seqscan;
select name, similarity(name,'ลูกค้า') s from tasks where name ilike '%ลูกค้า%' order by s desc limit 3;
