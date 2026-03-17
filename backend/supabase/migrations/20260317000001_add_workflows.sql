-- Workflow state machine tables for CRM update workflow
-- workflows.state:       0=created, 1=transcribing, 2=extracting, 3=review, 4=pushing, 5=done, 6=failed
-- workflow_tasks.state:   0=pending, 1=transcribing, 2=completed, 3=failed

CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  state SMALLINT NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 6),
  extractions JSONB DEFAULT '{}'::jsonb,
  original_values JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workflows_event_id ON workflows(event_id);

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('plaud', 'local')),
  recording_id TEXT NOT NULL,
  state SMALLINT NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
  transcript TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workflow_tasks_workflow_id ON workflow_tasks(workflow_id);

CREATE TRIGGER workflow_tasks_updated_at
  BEFORE UPDATE ON workflow_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
