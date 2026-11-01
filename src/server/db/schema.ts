// src/server/db/schema.ts — the single Drizzle schema (SPEC §6). No 'server-only' (M1-D4): `auth check schema`,
// tsx scripts and the Playwright reset import it. Property keys are Better Auth field names (camelCase), column
// names snake_case (r2 §8.1). Schema changes only here + `pnpm db:generate` (owned by the milestone's S0 stream).
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Fractional-index key column (SPEC §6.1, PLAN.md X48): byte-order collation so ORDER BY matches the JS `<`
 * comparison of fractional-indexing keys (the default en_US.utf8 collation mis-orders them).
 * Use for every user-ordered `position` column; sort with ORDER BY position, id.
 */
export const orderKey = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text COLLATE "C"'
  },
})

/** Every timestamp is timestamptz (PLAN.md §1.3); plan dates use date({ mode: 'string' }) instead. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => timestamptz('created_at').notNull().defaultNow()
const updatedAt = () =>
  timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// ---------------------------------------------------------------------------------------------------------------
// M1 — auth, employees, positions (PLAN.md X10, plan/m01 S0.4)
// ---------------------------------------------------------------------------------------------------------------

/** FR-208. Ordered by `position` (fractional key, COLLATE "C"), then id. No soft delete (M1-D14). */
export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(), // positions_name_unique
  position: orderKey('position').notNull(),
  createdAt: createdAt(),
})

/** Better Auth `user` + admin plugin columns + app columns (M1-D1, M1-D2). Active = `banned IS NOT TRUE`. */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(), // crypto.randomUUID() from our services
    name: text('name').notNull(),
    email: text('email').notNull().unique(), // user_email_unique; always lower(trim(email))
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    role: text('role').notNull().default('worker'), // 'manager' | 'worker' — narrowed in authz.ts
    banned: boolean('banned').default(false), // SPEC nullability; active = banned IS NOT TRUE
    banReason: text('ban_reason'),
    banExpires: timestamptz('ban_expires'), // admin plugin (PLAN.md §1.3)
    nickname: text('nickname'),
    positionId: uuid('position_id').references(() => positions.id),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    color: text('color'),
    deactivatedOn: date('deactivated_on', { mode: 'string' }), // app-owned; NOT declared to Better Auth
  },
  (t) => [
    index('user_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
    index('user_nickname_trgm').using('gin', t.nickname.op('gin_trgm_ops')),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamptz('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'), // admin plugin (PLAN.md §1.3)
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    refreshTokenExpiresAt: timestamptz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/** FR-106 lockout bookkeeping (PLAN.md §1.3, M1-D11): one row per failed sign-in. */
export const authLoginFailures = pgTable(
  'auth_login_failures',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull(), // lower(trim(email))
    ip: text('ip').notNull(), // getIP() or 'unknown'
    createdAt: createdAt(),
  },
  (t) => [index('auth_login_failures_email_ip_created_at_idx').on(t.email, t.ip, t.createdAt)],
)

/** X05: per-user UI preferences (validated by src/lib/schemas/preferences.ts on read and write). */
export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
})

/** FR-207: weekday 1 = Monday … 7 = Sunday; fraction '0.25' | '0.50' | '0.75' | '1.00' (↔ cd via units.ts). */
export const workSchedules = pgTable(
  'work_schedules',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    fraction: numeric('fraction', { precision: 3, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.weekday] }),
    check('work_schedules_weekday_check', sql`${t.weekday} between 1 and 7`),
    check('work_schedules_fraction_check', sql`${t.fraction} > 0 and ${t.fraction} <= 1`),
  ],
)

/** FR-1201 / X44: one row per user operation, written by the service inside its transaction (M1-D5). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: text('actor_id').references(() => user.id),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(), // 'create' | 'update' | 'delete' | 'restore'
    projectId: uuid('project_id'), // no FK (SPEC §6.2)
    summary: text('summary'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_project_id_created_at_idx').on(t.projectId, t.createdAt.desc()),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// M2 — clients, projects, members (SPEC §6.2, §6.4; plan/m02 S0.3)
// ---------------------------------------------------------------------------------------------------------------

export const certainty = pgEnum('certainty', ['CONFIRMED', 'TENTATIVE'])
export const projectRole = pgEnum('project_role', ['LEAD', 'MEMBER'])

/** FR-301. Name unique including archived (M2-D07); no hard delete in the app (archive only). */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(), // clients_name_unique
    code: text('code'),
    color: text('color'),
    note: text('note'),
    archivedAt: timestamptz('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('clients_name_trgm').using('gin', t.name.op('gin_trgm_ops'))],
)

/** FR-401. `deleted_at` is never set in the MVP (permanent delete = hard DELETE, M2-D11) but every query filters it. */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    code: text('code'),
    color: text('color').notNull().default('#2F5597'),
    certainty: certainty('certainty').notNull().default('CONFIRMED'),
    certaintyNote: text('certainty_note'),
    archivedAt: timestamptz('archived_at'),
    deletedAt: timestamptz('deleted_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_name_trgm').using('gin', t.name.op('gin_trgm_ops'))],
)

/** SPEC §3.1 / FR-403: membership + project role; cascades with the project and the user. */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: projectRole('role').notNull().default('MEMBER'),
    addedBy: text('added_by').references(() => user.id),
    addedAt: timestamptz('added_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('project_members_user_id_idx').on(t.userId),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// M3 — task statuses, tasks, assignments, blockers (SPEC v3.1 §6.2 minus tasks.milestone_id; plan/m03 S0.2, X70,
// X73, M3-D36). Positions are orderKey (X48); plan dates are date({ mode: 'string' }) (BR-04).
// ---------------------------------------------------------------------------------------------------------------

export const taskStatusCategory = pgEnum('task_status_category', ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'])

/** FR-620–624: per-project status set (≥ 1 TODO and ≥ 1 DONE, BR-84). Soft delete under a batch (X72). */
export const taskStatuses = pgTable(
  'task_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#94A3B8'),
    category: taskStatusCategory('category').notNull(),
    position: orderKey('position').notNull(), // board column order (X48)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
    deletedBatch: uuid('deleted_batch'),
  },
  (t) => [
    check('task_statuses_name_check', sql`length(trim(${t.name})) > 0`),
    unique('task_statuses_project_id_id_key').on(t.projectId, t.id), // target of tasks_status_fk (BR-83)
    uniqueIndex('task_statuses_name')
      .on(t.projectId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index('task_statuses_project_id_position_idx')
      .on(t.projectId, t.position)
      .where(sql`${t.deletedAt} is null`),
  ],
)

/** FR-601: depth 0..2 (BR-30); status of the same project (BR-83 composite FK); no milestone_id until M8 (X21). */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    depth: smallint('depth').notNull().default(0),
    name: text('name').notNull(),
    // notes: dropped in M6.1 (FR-692) — migrated into the task's TASK page by 0010_task_notes_to_body
    startDate: date('start_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    certaintyOverride: certainty('certainty_override'),
    // milestone_id: added by M8 (X10/X21) — do not add here
    statusId: uuid('status_id').notNull(), // composite FK tasks_status_fk below (BR-83, X70)
    completedOn: date('completed_on', { mode: 'string' }), // set/cleared with the status category (BR-80)
    completedWeek: date('completed_week', { mode: 'string' }).generatedAlwaysAs(
      sql`(date_trunc('week', completed_on::timestamp)::date)`,
    ), // never written (428C9)
    completedBy: text('completed_by').references(() => user.id),
    position: orderKey('position').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
    deletedBatch: uuid('deleted_batch'),
  },
  (t) => [
    check('tasks_depth_check', sql`${t.depth} between 0 and 2`),
    check('tasks_name_check', sql`length(trim(${t.name})) > 0`),
    check(
      'tasks_dates_check',
      sql`${t.dueDate} is null or ${t.startDate} is null or ${t.dueDate} >= ${t.startDate}`,
    ),
    index('tasks_project_id_parent_id_position_idx')
      .on(t.projectId, t.parentId, t.position)
      .where(sql`${t.deletedAt} is null`),
    index('tasks_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
    index('tasks_status_id_idx')
      .on(t.statusId)
      .where(sql`${t.deletedAt} is null`),
    unique('tasks_project_id_id_key').on(t.projectId, t.id), // target of the task_blockers composite FKs
    // No ON DELETE action: statuses are only soft-deleted; a project delete removes both tables in one statement.
    foreignKey({
      name: 'tasks_status_fk',
      columns: [t.projectId, t.statusId],
      foreignColumns: [taskStatuses.projectId, taskStatuses.id],
    }),
  ],
)

/** FR-605: assignments only on leaves (BR-31); `version` is bumped by every allocation writer (BR-20b, M6). */
export const taskAssignments = pgTable(
  'task_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    deletedAt: timestamptz('deleted_at'),
    deletedBatch: uuid('deleted_batch'),
  },
  (t) => [
    uniqueIndex('task_assignments_active')
      .on(t.taskId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index('task_assignments_user_id_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} is null`),
  ],
)

/** FR-640–645: `task_id` is blocked by `blocker_task_id`; both in the same project (composite FKs, D12). */
export const taskBlockers = pgTable(
  'task_blockers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id').notNull(), // the blocked task
    blockerTaskId: uuid('blocker_task_id').notNull(), // the task that blocks it
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    deletedAt: timestamptz('deleted_at'),
    deletedBatch: uuid('deleted_batch'),
  },
  (t) => [
    check('task_blockers_not_self', sql`${t.taskId} <> ${t.blockerTaskId}`),
    foreignKey({
      name: 'task_blockers_task_fk',
      columns: [t.projectId, t.taskId],
      foreignColumns: [tasks.projectId, tasks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_blockers_blocker_fk',
      columns: [t.projectId, t.blockerTaskId],
      foreignColumns: [tasks.projectId, tasks.id],
    }).onDelete('cascade'),
    uniqueIndex('task_blockers_active')
      .on(t.taskId, t.blockerTaskId)
      .where(sql`${t.deletedAt} is null`),
    index('task_blockers_blocker_task_id_idx')
      .on(t.blockerTaskId)
      .where(sql`${t.deletedAt} is null`),
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// M4 — pages, page_locks, files (SPEC §6.2, DM-09, X10; plan/m04 S0.3). The circular pages.cover_file_id ↔ files
// FK is emitted after both tables (r2 §12); Drizzle names it pages_cover_file_id_files_id_fk (M4-D25).
// ---------------------------------------------------------------------------------------------------------------

export const pageSpace = pgEnum('page_space', ['WORKSPACE', 'PROJECT'])

/** SPEC §6.2: M6.1 creates DOC + TASK; M11 adds 'DB_ROW' with `alter type page_kind add value` (custom migration). */
export const pageKind = pgEnum('page_kind', ['DOC', 'TASK'])

/** FR-501…510: one page system for the team wiki (WORKSPACE) and project documents (PROJECT); depth 0..9 (FR-502). */
export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    space: pageSpace('space').notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
    depth: smallint('depth').notNull().default(0),
    title: text('title').notNull().default(''),
    icon: text('icon'), // emoji (curated PAGE_ICONS)
    coverFileId: uuid('cover_file_id').references((): AnyPgColumn => files.id, { onDelete: 'set null' }),
    content: jsonb('content').$type<unknown[]>().notNull().default([]), // BlockNote Block[] (§7.7)
    contentText: text('content_text').notNull().default(''), // extractContentText(content) (DM-16, M4-D10)
    isCharter: boolean('is_charter').notNull().default(false),
    // M6.1 (§4.6.4, FR-681): a TASK page is the 1:1 body of a task — never in a tree, fixed key 'a0' (X48).
    kind: pageKind('kind').notNull().default('DOC'),
    taskId: uuid('task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    fullWidth: boolean('full_width').notNull().default(false), // FR-1602: shared page property, every kind
    locked: boolean('locked').notNull().default(false), // FR-510 "protected" (WORKSPACE only, service-enforced)
    version: integer('version').notNull().default(1), // FR-543 (content saves only, M4-D4)
    position: orderKey('position').notNull(), // text COLLATE "C" (X48)
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
    deletedBatch: uuid('deleted_batch'),
  },
  (t) => [
    check('pages_depth_check', sql`${t.depth} between 0 and 9`),
    check('pages_space_project_check', sql`(${t.space} = 'PROJECT') = (${t.projectId} is not null)`),
    // M6.1 (SPEC §6.2 verbatim + pages_task_space, M6.1-D3)
    check('pages_kind_task', sql`(${t.kind} = 'TASK') = (${t.taskId} is not null)`),
    check(
      'pages_kind_shape',
      sql`${t.kind} = 'DOC' or (${t.parentId} is null and ${t.depth} = 0 and not ${t.isCharter} and not ${t.locked} and ${t.title} = '')`,
    ),
    check('pages_task_space', sql`${t.kind} <> 'TASK' or ${t.space} = 'PROJECT'`),
    uniqueIndex('pages_task_id_unique').on(t.taskId),
    index('pages_tree_idx')
      .on(t.space, t.projectId, t.parentId, t.position)
      .where(sql`${t.deletedAt} is null and ${t.kind} = 'DOC'`),
    uniqueIndex('one_charter_per_project')
      .on(t.projectId)
      .where(sql`${t.isCharter} and ${t.deletedAt} is null`),
    index('pages_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
    index('pages_content_trgm').using('gin', t.contentText.op('gin_trgm_ops')),
  ],
)

/** FR-540–542 "edit lease" (≠ FR-510 protection, X63): one holder per page, expires 2 min after the last heartbeat. */
export const pageLocks = pgTable('page_locks', {
  pageId: uuid('page_id')
    .primaryKey()
    .references(() => pages.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamptz('expires_at').notNull(),
})

/** §7.6: uploaded bytes live in UPLOAD_DIR under `storage_key`; downloads authorised by project_id (null = wiki). */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storageKey: text('storage_key').notNull().unique(), // path inside UPLOAD_DIR
    originalName: text('original_name').notNull(),
    mime: text('mime').notNull(), // detected from magic bytes, never the client's type
    sizeBytes: integer('size_bytes').notNull(),
    kind: text('kind', { enum: ['IMAGE', 'ATTACHMENT'] }).notNull(),
    pageId: uuid('page_id').references((): AnyPgColumn => pages.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }), // null = wiki
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('files_kind_check', sql`${t.kind} in ('IMAGE','ATTACHMENT')`),
    index('files_project_id_idx').on(t.projectId), // M4-D25: FR-407 key collection + FK cascades
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// M5 — holidays, leave_types, time_off (SPEC §6.2, X10, X48; plan/m05 S0.3). The EXCLUDE constraint
// "time_off_no_overlap" has no Drizzle API: it lives in the custom migration `time_off_no_overlap` (needs btree_gist
// from 0000_extensions); its name is pinned for error mapping and tests.
// ---------------------------------------------------------------------------------------------------------------

export const halfDay = pgEnum('half_day', ['AM', 'PM'])

/** FR-901: company holidays (one per date). Hard delete; undo re-inserts the same id (X64). */
export const holidays = pgTable('holidays', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date', { mode: 'string' }).notNull().unique(), // holidays_date_unique
  name: text('name').notNull(),
})

/** FR-902: leave types, ordered by `position` (X48). Names unique incl. archived; in use → archive, not delete. */
export const leaveTypes = pgTable('leave_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(), // leave_types_name_unique
  color: text('color').notNull().default('#94A3B8'),
  position: orderKey('position').notNull(), // text COLLATE "C" (X48)
  archivedAt: timestamptz('archived_at'),
})

/** FR-903…909: leave entries (full day or half day on a single date); soft delete by batch (FR-909). */
export const timeOff = pgTable(
  'time_off',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id), // RESTRICT (default)
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    half: halfDay('half'), // null = full day
    note: text('note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
    deletedBatch: uuid('deleted_batch'),
  },
  (t) => [
    check('time_off_range_check', sql`${t.endDate} >= ${t.startDate}`),
    check('time_off_half_check', sql`${t.half} is null or ${t.startDate} = ${t.endDate}`),
    index('time_off_user_id_start_date_end_date_idx')
      .on(t.userId, t.startDate, t.endDate)
      .where(sql`${t.deletedAt} is null`),
    // EXCLUDE "time_off_no_overlap": custom migration (no Drizzle API, r2 §9.2)
  ],
)

// ---------------------------------------------------------------------------------------------------------------
// M6 — allocations (SPEC §6.2, BR-20/20b/26, X10; plan/m06 S0.3). The BR-20b trigger `trg_week_day_exclusivity`
// and the EXCLUDE constraint "allocations_one_resolution_per_week" have no Drizzle API: they live in the custom
// migration `allocations_week_day_guard` (needs btree_gist from 0000_extensions, M6-D5). numeric(4,2) ↔ cd only in
// src/server/repo/allocations.ts (BR-02). Every query on this table carries a `week_start` range (SPEC §6.5).
// ---------------------------------------------------------------------------------------------------------------

export const granularity = pgEnum('granularity', ['WEEK', 'DAY'])

/** Plans per assignment: one WEEK row per week, or DAY rows inside that week — never both (BR-20b). */
export const allocations = pgTable(
  'allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskAssignmentId: uuid('task_assignment_id')
      .notNull()
      .references(() => taskAssignments.id, { onDelete: 'cascade' }),
    granularity: granularity('granularity').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(), // Monday for WEEK, the day for DAY
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    personDays: numeric('person_days', { precision: 4, scale: 2 }).notNull(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('allocations_ta_granularity_period_key').on(t.taskAssignmentId, t.granularity, t.periodStart),
    check('allocations_person_days_check', sql`${t.personDays} > 0`),
    check('allocations_week_start_check', sql`extract(isodow from ${t.weekStart}) = 1`),
    check(
      'allocations_period_check',
      sql`(${t.granularity} = 'WEEK' and ${t.periodStart} = ${t.weekStart} and ${t.personDays} <= 7) or
      (${t.granularity} = 'DAY' and ${t.periodStart} >= ${t.weekStart} and ${t.periodStart} < ${t.weekStart} + 7 and ${t.personDays} <= 1)`,
    ),
    index('allocations_week_start_ta_idx').on(t.weekStart, t.taskAssignmentId),
    index('allocations_ta_week_start_idx').on(t.taskAssignmentId, t.weekStart),
    // EXCLUDE "allocations_one_resolution_per_week" + trigger: custom migration allocations_week_day_guard
  ],
)

export type AllocationDbRow = typeof allocations.$inferSelect
export type NewAllocation = typeof allocations.$inferInsert

export type HolidayRow = typeof holidays.$inferSelect
export type NewHoliday = typeof holidays.$inferInsert
export type LeaveTypeRow = typeof leaveTypes.$inferSelect
export type NewLeaveType = typeof leaveTypes.$inferInsert
export type TimeOffRow = typeof timeOff.$inferSelect
export type NewTimeOff = typeof timeOff.$inferInsert

export type PageRow = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert
export type PageLockRow = typeof pageLocks.$inferSelect
export type FileRow = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert

export type ClientRow = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type ProjectRow = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectMemberRow = typeof projectMembers.$inferSelect
export type NewProjectMember = typeof projectMembers.$inferInsert
export type TaskStatusDbRow = typeof taskStatuses.$inferSelect
export type TaskDbRow = typeof tasks.$inferSelect
export type TaskAssignmentDbRow = typeof taskAssignments.$inferSelect
export type TaskBlockerDbRow = typeof taskBlockers.$inferSelect
