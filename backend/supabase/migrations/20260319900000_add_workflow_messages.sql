-- Workflow messages table for conversational CRM update flow
-- role:  0=user, 1=assistant
-- type:  0=text, 1=extraction, 2=progress

CREATE TABLE workflow_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  role SMALLINT NOT NULL CHECK (role IN (0, 1)),
  type SMALLINT NOT NULL DEFAULT 0 CHECK (type IN (0, 1, 2)),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workflow_messages_workflow_id ON workflow_messages(workflow_id);

-- Also add messages column to workflows for Gemini conversation history
-- (separate from UI messages — this tracks the LLM context)
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

-- Make event_id nullable (workflows can be created without an event)
ALTER TABLE workflows ALTER COLUMN event_id DROP NOT NULL;

-- Add user_id to workflows
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
