// tests/authz/rows/index.ts — the single registry of authz rows (X91, C72/C98). Every milestone's test stream adds
// one import + spread per rows file it creates; the matrix and M11's audit sweep read only this index.
import type { AuthzRow } from '../types'
import { rows as account } from './account'
import { rows as allocations } from './allocations'
import { rows as allocationsDay } from './allocations-day'
import { rows as assignments } from './assignments'
import { rows as authEndpoints } from './auth-endpoints'
import { rows as calendar } from './calendar'
import { rows as clients } from './clients'
import { rows as databases } from './databases'
import { rows as employees } from './employees'
import { rows as files } from './files'
import { rows as gridDay } from './grid-day'
import { rows as holidays } from './holidays'
import { rows as home } from './home'
import { rows as leaveTypes } from './leave-types'
import { rows as members } from './members'
import { rows as milestones } from './milestones'
import { rows as pages } from './pages'
import { rows as people } from './people'
import { rows as planMarkers } from './plan-markers'
import { rows as positions } from './positions'
import { rows as preferences } from './preferences'
import { rows as projects } from './projects'
import { rows as rowPages } from './row-pages'
import { rows as search } from './search'
import { rows as taskBlockers } from './task-blockers'
import { rows as taskPages } from './task-pages'
import { rows as taskStatuses } from './task-statuses'
import { rows as tasks } from './tasks'
import { rows as timeOff } from './time-off'
import { rows as wiki } from './wiki'
import { rows as workload } from './workload'

// Rows are generic over their setup context; the matrix treats the context as opaque.
export const rows: AuthzRow[] = [
  ...employees,
  ...positions,
  ...account,
  ...preferences,
  ...authEndpoints,
  // M2
  ...clients,
  ...projects,
  ...members,
  // M3
  ...tasks,
  ...assignments,
  ...taskStatuses,
  ...taskBlockers,
  // M4
  ...pages,
  ...wiki,
  ...files,
  ...search,
  // M5
  ...holidays,
  ...leaveTypes,
  ...timeOff,
  ...calendar,
  // M6
  ...allocations,
  // M6.1
  ...taskPages,
  // M7
  ...gridDay,
  ...allocationsDay,
  // M7.1
  ...planMarkers,
  // M8
  ...milestones,
  // M9
  ...workload,
  ...people,
  // M10
  ...home,
  // M11
  ...databases,
  ...rowPages,
]
