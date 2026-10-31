// src/server/db/schema.ts — the single Drizzle schema (SPEC §6). No 'server-only' (M1-D4): `auth check schema`,
// tsx scripts and the Playwright reset import it. Property keys are Better Auth field names (camelCase), column
// names snake_case (r2 §8.1). Schema changes only here + `pnpm db:generate` (owned by the milestone's S0 stream).
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
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

export type ClientRow = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type ProjectRow = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectMemberRow = typeof projectMembers.$inferSelect
export type NewProjectMember = typeof projectMembers.$inferInsert
