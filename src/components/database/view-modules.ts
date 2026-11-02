// src/components/database/view-modules.ts — side-effect imports that register the non-table views with
// view-registry.ts (plan/m11 S3.2): KANBAN and CALENDAR (S4). A type without a registration renders "—".
import './kanban/register'
import './calendar/register'
