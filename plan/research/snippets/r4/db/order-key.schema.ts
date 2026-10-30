import { customType, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

/** Fractional-index key column: byte-order (C) collation so ORDER BY matches JS string order. */
export const orderKey = customType<{ data: string }>({
  dataType() {
    return 'text COLLATE "C"'
  },
})

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    position: orderKey('position').notNull(),
  },
  (t) => [index('tasks_project_parent_position_idx').on(t.projectId, t.parentId, t.position)],
)
