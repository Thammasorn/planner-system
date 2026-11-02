// src/domain/database.ts — barrel of the database-in-page domain (SPEC §5.11 BR-90…97, FR-1475; plan/m11 S1).
// Pure: no DB / Next / React. Server validation (services) and client views (components/database) both call it.
export * from './database/limits'
export * from './database/number'
export * from './database/date'
export * from './database/url'
export * from './database/cells'
export * from './database/convert'
export * from './database/sort'
export * from './database/filter'
export * from './database/group'
export * from './database/calendar'
export * from './database/view'
