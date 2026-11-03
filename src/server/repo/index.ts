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
// M4 (X87)
export * as files from './files'
export * as pageLocks from './page-locks'
export * as pages from './pages'
// M5 (X80/X87)
export * as holidays from './holidays'
export * as leaveTypes from './leave-types'
export * as timeOff from './time-off'
// M6 (M6-D24): the only module that touches `allocations`
export * as allocations from './allocations'
// M7.1 (plan/m07.1 S0.6)
// M8 (X87, plan/m08 S0.5)
export * as milestones from './milestones'
// M9 (plan/m09 S2.2)
export * as workload from './workload'
// M11 (plan/m11 S0.7)
export * as databases from './databases'
