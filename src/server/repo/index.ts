// src/server/repo/index.ts — namespace barrel (X87): services call `repo.<area>.<fn>`.
// Every later milestone appends its files here (M2 clients, projects, members, people; …).
export * as accounts from './accounts'
export * as clients from './clients'
export * as members from './members'
export * as order from './order'
export * as people from './people'
export * as positions from './positions'
export * as preferences from './preferences'
export * as projects from './projects'
export * as sessions from './sessions'
export * as users from './users'
// M3 (M3-D39): pinned names used by M6/M7/M9
export * as tasks from './tasks'
export * as assignments from './task-assignments'
export * as statuses from './task-statuses'
export * as blockers from './task-blockers'
