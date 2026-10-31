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
