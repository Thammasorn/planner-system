-- Custom SQL migration: extensions must exist before gin_trgm_ops indexes (M3+) and EXCLUDE USING gist (M5)
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
