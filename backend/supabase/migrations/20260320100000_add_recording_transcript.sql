-- Add transcript text field to recordings
-- If a recording already has a transcript, the CRM update workflow
-- skips transcription and goes directly to analysis.
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS transcript TEXT;
