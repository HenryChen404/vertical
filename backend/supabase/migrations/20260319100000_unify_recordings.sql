-- Unify recordings table to handle both PLAUD and local files
-- Make storage_path and event_id nullable, add source/plaud fields

ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE recordings ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE recordings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS plaud_file_id TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- Unique constraint: one row per PLAUD file per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_plaud_file_id
  ON recordings(plaud_file_id) WHERE plaud_file_id IS NOT NULL;

-- Drop event_file_links (replaced by recordings.event_id)
DROP TABLE IF EXISTS event_file_links;
