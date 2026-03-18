-- Add feedback text field to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS feedback TEXT NOT NULL DEFAULT '';
