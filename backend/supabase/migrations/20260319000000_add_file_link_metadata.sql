-- Add file metadata to event_file_links so we don't need to call PLAUD API on read
ALTER TABLE event_file_links ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE event_file_links ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
