// tests/authz/rows/index.ts — the single registry of authz rows (X91, C72/C98). Every milestone's test stream adds
// one import + spread per rows file it creates; the matrix and M11's audit sweep read only this index.
import type { AuthzRow } from '../types'
import { rows as account } from './account'
import { rows as assignments } from './assignments'
import { rows as authEndpoints } from './auth-endpoints'
import { rows as clients } from './clients'
import { rows as employees } from './employees'
import { rows as files } from './files'
import { rows as members } from './members'
import { rows as pages } from './pages'
import { rows as positions } from './positions'
import { rows as preferences } from './preferences'
import { rows as projects } from './projects'
import { rows as search } from './search'
import { rows as taskBlockers } from './task-blockers'
import { rows as taskStatuses } from './task-statuses'
import { rows as tasks } from './tasks'
import { rows as wiki } from './wiki'

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
]
