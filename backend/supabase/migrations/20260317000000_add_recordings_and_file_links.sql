-- Local recordings (captured in-app, stored in Supabase Storage)
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  transcript JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recordings_event_id ON recordings(event_id);

-- Linked files (PLAUD file <-> event association)
CREATE TABLE event_file_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  plaud_file_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, plaud_file_id)
);

CREATE INDEX idx_event_file_links_event_id ON event_file_links(event_id);

-- Create storage bucket for recordings (Supabase Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;
