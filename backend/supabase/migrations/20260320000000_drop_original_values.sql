-- Drop original_values column — old/new diffs now live in proposed_changes
-- The extractions JSONB column now stores:
--   {"proposed_changes": [...], "summary": "..."}
-- instead of the old dimension-based format:
--   {"opportunity": {"status": "completed", "data": {...}}, ...}

ALTER TABLE workflows DROP COLUMN IF EXISTS original_values;

COMMENT ON COLUMN workflows.extractions IS
  'Stores proposed CRM changes as JSONB: {proposed_changes: [...], summary: "..."}';
