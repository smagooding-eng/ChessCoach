-- Soft-delete column added in Task #21 (puzzle/course correctness pass).
-- Drizzle in this project uses `db:push`, so this file documents the
-- equivalent SQL for environments that do not auto-push schema changes.
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS puzzles_archived_idx ON puzzles (archived);
CREATE INDEX IF NOT EXISTS courses_archived_idx ON courses (archived);
CREATE INDEX IF NOT EXISTS lessons_archived_idx ON lessons (archived);
