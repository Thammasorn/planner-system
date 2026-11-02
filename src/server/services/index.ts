// src/server/services/index.ts — namespace barrel (X87): actions call `services.<area>.<fn>`.
// Every later milestone appends its areas here. `masking.ts` is imported directly by services, not through the barrel.
export * as account from './account'
export * as clients from './clients'
export * as employees from './employees'
export * as members from './members'
export * as people from './people'
export * as positions from './positions'
export * as preferences from './preferences'
export * as projects from './projects'
export * as sidebar from './sidebar'
export * as users from './users'
// M3 (M3-D39, X80/X87)
export * as assignments from './assignments'
export * as myTasks from './my-tasks'
export * as taskBlockers from './taskBlockers'
export * as taskStatus from './taskStatus'
export * as taskStatuses from './taskStatuses'
export * as taskTree from './task-tree'
export * as tasks from './tasks'
export * as teamTasks from './teamTasks'
// M4 (X87)
export * as charters from './charters'
export * as files from './files'
export * as pageLease from './page-lease'
export * as pageTree from './page-tree'
export * as pages from './pages'
export * as search from './search'
// M5 (X80/X87)
export * as calendar from './calendar'
export * as capacity from './capacity'
export * as holidays from './holidays'
export * as leaveTypes from './leave-types'
export * as timeOff from './time-off'
// M6 (PLAN §3.10: services.grid.buildChunk, services.allocations.save)
export * as allocations from './allocations'
export * as grid from './grid'
// M6.1 (task bodies, task page, full width)
export * as taskPages from './task-pages'
// M7.1 (plan/m07.1 S0.6)
export * as planMarkers from './plan-markers'
// M8 (X87, plan/m08 S0.5)
export * as milestones from './milestones'
// M9 (plan/m09 S0.6)
export * as workload from './workload'
// M10 (X87, plan/m10 S0)
export * as embed from './embed'
export * as home from './home'
// M11 (plan/m11 S0.7)
export * as databaseCopy from './database-copy'
export * as databases from './databases'
export * as rowPages from './row-pages'
