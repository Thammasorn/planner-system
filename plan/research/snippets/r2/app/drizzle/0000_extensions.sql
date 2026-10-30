-- Custom SQL migration: extensions must exist before gin_trgm_ops indexes / gist exclusion
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
