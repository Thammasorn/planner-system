
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

create type certainty    as enum ('CONFIRMED','TENTATIVE');
create type granularity  as enum ('WEEK','DAY');
create type project_role as enum ('LEAD','MEMBER');
create type page_space   as enum ('WORKSPACE','PROJECT');
create type half_day     as enum ('AM','PM');

-- ─────────────── Better Auth (generate ด้วย CLI ของ Better Auth) ───────────────
-- ตาราง "user", "session", "account", "verification" สร้างโดย Better Auth
-- คอลัมน์เพิ่มบน "user" (ผ่าน additionalFields + admin plugin):
--   role                 text    not null default 'worker'   -- 'manager' | 'worker'
--   banned               boolean                              -- ใช้แทน "ปิดใช้งาน"
--   ban_reason           text
--   nickname             text
--   position_id          uuid    references positions(id)
--   must_change_password boolean not null default true
--   color                text                                 -- สี avatar
--   deactivated_on       date                                 -- BR-13

create table positions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  position    text not null,                     -- fractional index
  created_at  timestamptz not null default now()
);

create table user_preferences (
  user_id     text primary key references "user"(id) on delete cascade,
  data        jsonb not null default '{}'        -- { unit: 'DAYS'|'FRACTION', zoom, showCompleted, ... }
);

-- ─────────────── ปฏิทิน ───────────────
create table work_schedules (
  user_id   text not null references "user"(id) on delete cascade,
  weekday   smallint not null check (weekday between 1 and 7),   -- 1 = จันทร์
  fraction  numeric(3,2) not null check (fraction > 0 and fraction <= 1),
  primary key (user_id, weekday)
);
-- ไม่มีแถว = ไม่ทำงานวันนั้น; สร้างพนักงานใหม่ → insert จ–ศ = 1.00

create table holidays (
  id    uuid primary key default gen_random_uuid(),
  date  date not null unique,
  name  text not null
);

create table leave_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#94A3B8',
  position    text not null,
  archived_at timestamptz
);

create table time_off (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references "user"(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id),
  start_date    date not null,
  end_date      date not null,
  half          half_day,                         -- null = เต็มวัน
  note          text,
  created_by    text not null references "user"(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_batch uuid,
  check (end_date >= start_date),
  check (half is null or start_date = end_date),
  exclude using gist (user_id with =, daterange(start_date, end_date, '[]') with &&)
    where (deleted_at is null)
);
create index on time_off (user_id, start_date, end_date) where deleted_at is null;

-- ─────────────── ลูกค้า & โปรเจค ───────────────
create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text,
  color       text,
  note        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table projects (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references clients(id) on delete set null,
  name           text not null,
  code           text,
  color          text not null default '#2F5597',
  certainty      certainty not null default 'CONFIRMED',
  certainty_note text,
  archived_at    timestamptz,
  deleted_at     timestamptz,                    -- ลบถาวรด้วย hard delete; ใช้ soft เฉพาะช่วงรอ
  created_by     text not null references "user"(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table project_members (
  project_id  uuid not null references projects(id) on delete cascade,
  user_id     text not null references "user"(id) on delete cascade,
  role        project_role not null default 'MEMBER',
  added_by    text references "user"(id),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on project_members (user_id);

-- ─────────────── หน้าเอกสาร ───────────────
create table pages (
  id            uuid primary key default gen_random_uuid(),
  space         page_space not null,
  project_id    uuid references projects(id) on delete cascade,
  parent_id     uuid references pages(id) on delete cascade,
  depth         smallint not null default 0 check (depth between 0 and 9),
  title         text not null default '',
  icon          text,                            -- emoji
  cover_file_id uuid,                            -- fk ไป files (เพิ่มหลังสร้าง files)
  content       jsonb not null default '[]',     -- BlockNote document (Block[])
  content_text  text not null default '',        -- plain text สำหรับค้นหา
  is_charter    boolean not null default false,
  locked        boolean not null default false,  -- FR-510 (เฉพาะ WORKSPACE)
  version       int not null default 1,          -- FR-543
  position      text not null,
  created_by    text not null references "user"(id),
  updated_by    text not null references "user"(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_batch uuid,
  check ((space = 'PROJECT') = (project_id is not null))
);
create index on pages (space, project_id, parent_id, position) where deleted_at is null;
create unique index one_charter_per_project on pages (project_id)
  where is_charter and deleted_at is null;
create index pages_title_trgm   on pages using gin (title gin_trgm_ops);
create index pages_content_trgm on pages using gin (content_text gin_trgm_ops);

create table page_locks (
  page_id     uuid primary key references pages(id) on delete cascade,
  user_id     text not null references "user"(id) on delete cascade,
  expires_at  timestamptz not null               -- now() + 2 นาที, ต่อด้วย heartbeat
);

create table files (
  id            uuid primary key default gen_random_uuid(),
  storage_key   text not null unique,            -- path ใน UPLOAD_DIR
  original_name text not null,
  mime          text not null,                   -- ตรวจจาก magic bytes ไม่เชื่อ client
  size_bytes    int not null,
  kind          text not null check (kind in ('IMAGE','ATTACHMENT')),
  page_id       uuid references pages(id) on delete set null,
  project_id    uuid references projects(id) on delete cascade,  -- null = wiki ทีม
  uploaded_by   text not null references "user"(id),
  created_at    timestamptz not null default now()
);
alter table pages add constraint pages_cover_fk foreign key (cover_file_id) references files(id) on delete set null;

-- ─────────────── Milestones & Tasks ───────────────
create table milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  date          date not null,
  description   text,
  completed_on  date,
  created_by    text not null references "user"(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_batch uuid
);
create index on milestones (project_id, date) where deleted_at is null;

create table tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  parent_id          uuid references tasks(id) on delete cascade,
  depth              smallint not null default 0 check (depth between 0 and 2),
  name               text not null check (length(trim(name)) > 0),
  notes              text,
  start_date         date,
  due_date           date,
  certainty_override certainty,
  milestone_id       uuid references milestones(id) on delete set null,
  completed_on       date,
  completed_week     date generated always as
                       (date_trunc('week', completed_on::timestamp)::date) stored,
  completed_by       text references "user"(id),
  position           text not null,
  created_by         text not null references "user"(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_batch      uuid,
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index on tasks (project_id, parent_id, position) where deleted_at is null;
create index tasks_name_trgm on tasks using gin (name gin_trgm_ops);
-- หมายเหตุ: completed_on เป็น date (ไม่ใช่ timestamptz) เพื่อให้ generated column
-- เป็น immutable ได้ — app ต้องตั้งค่าเป็นวันที่ตาม Asia/Bangkok

create table task_assignments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  user_id       text not null references "user"(id),
  version       int not null default 1,          -- optimistic concurrency ของแผน
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_batch uuid
);
create unique index task_assignments_active on task_assignments (task_id, user_id)
  where deleted_at is null;
create index on task_assignments (user_id) where deleted_at is null;

create table allocations (
  id                 uuid primary key default gen_random_uuid(),
  task_assignment_id uuid not null references task_assignments(id) on delete cascade,
  granularity        granularity not null,
  period_start       date not null,              -- จันทร์ถ้า WEEK / วันนั้นถ้า DAY
  week_start         date not null,              -- สัปดาห์ที่ period นี้อยู่ (ใช้ index)
  person_days        numeric(4,2) not null check (person_days > 0),
  updated_at         timestamptz not null default now(),
  unique (task_assignment_id, granularity, period_start),
  check (extract(isodow from week_start) = 1),
  check (
    (granularity = 'WEEK' and period_start = week_start and person_days <= 7) or
    (granularity = 'DAY'  and period_start >= week_start
                          and period_start <  week_start + 7 and person_days <= 1)
  )
);
create index on allocations (week_start, task_assignment_id);
create index on allocations (task_assignment_id, week_start);

-- ─────────────── Audit ───────────────
create table audit_log (
  id          bigserial primary key,
  actor_id    text references "user"(id),
  entity      text not null,                     -- 'task' | 'allocation' | 'page' | ...
  entity_id   text not null,
  action      text not null,                     -- 'create' | 'update' | 'delete' | 'restore'
  project_id  uuid,
  summary     text,                              -- ข้อความอ่านง่าย เช่น "Cindy แก้แผน 3 ช่อง"
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index on audit_log (project_id, created_at desc);
create index on audit_log (entity, entity_id);
