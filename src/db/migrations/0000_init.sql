-- Baseline migration so `pnpm db:migrate` works before any tables exist. Lane A adds real ones.
SELECT 1;
