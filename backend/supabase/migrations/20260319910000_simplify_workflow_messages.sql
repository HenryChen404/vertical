-- Simplify workflow_messages: drop type column, messages are just role + content
ALTER TABLE workflow_messages DROP COLUMN IF EXISTS type;
