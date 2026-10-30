# Tech stack — RESOLVED 2026-09-30

> This note was the owner's draft. It is **superseded** by the decisions below, which were made on
> 2026-09-30 and are recorded in SPEC §7.1, PROGRESS.md › Decisions/Deviations and PLAN.md §1.1.
> Claude Code: follow SPEC.md and PLAN.md, not the draft.

| Topic | Draft | Decision |
|---|---|---|
| Backend | Python FastAPI | **Next.js full-stack TypeScript** (SPEC §7.1: server actions + route handlers, Drizzle, Better Auth). The domain math runs in both the server and the planning grid. |
| Database | Postgres | **PostgreSQL 17** (unchanged) |
| Object storage | MinIO ("Is it still open source?") | **Local disk volume** (`UPLOAD_DIR`). MinIO's community edition is effectively no longer open-source-maintained: the GitHub repo went into maintenance mode (Dec 2025), then was archived (Feb/Apr 2026); it is source-only and publishes no official images or binaries. `storage.ts` keeps an S3-compatible driver possible later (SeaweedFS, Apache-2.0; or Garage, AGPL-3.0). |
| Frontend | Next.js + Material UI ("modern and clean") | **Next.js + Material UI 9**. The BlockNote editor uses `@blocknote/mantine` themed to match, because BlockNote has no MUI package. |

## Original draft

- Backend: Python Fast-API
- Database: Postgres
- Object Storage: Minio (s3 compatible) (Is it still opensource?)
- Frontend: Next.js, Material UI (Modern and Clean)
