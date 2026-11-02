'use client'
// src/components/database/kanban/register.ts — plugs the kanban view and its ⋯ items into the database block
// (view-registry.ts, plan/m11 S3.2/S4.1). Imported for its side effect by view-modules.ts.
import { registerDatabaseView } from '../view-registry'
import { KanbanMenuItems, KanbanView } from './KanbanView'

registerDatabaseView('KANBAN', { View: KanbanView, MenuItems: KanbanMenuItems })
