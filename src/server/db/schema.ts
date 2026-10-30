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
