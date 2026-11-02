'use client'
// src/components/database/calendar/register.ts — plugs the calendar view and its ⋯ items into the database block
// (view-registry.ts, plan/m11 S3.2/S4.2). Imported for its side effect by view-modules.ts.
import { registerDatabaseView } from '../view-registry'
import { CalendarMenuItems, CalendarView } from './CalendarView'

registerDatabaseView('CALENDAR', { View: CalendarView, MenuItems: CalendarMenuItems })
