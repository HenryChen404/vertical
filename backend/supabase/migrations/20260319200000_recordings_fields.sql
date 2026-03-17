-- 1. source: text → integer (1=plaud, 2=local)
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS source_type INTEGER;
UPDATE recordings SET source_type = CASE WHEN source = 'plaud' THEN 1 ELSE 2 END;
ALTER TABLE recordings ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE recordings ALTER COLUMN source_type SET DEFAULT 2;
ALTER TABLE recordings DROP COLUMN IF EXISTS source;

-- 2. crm_sync_status: 1=not synced, 2=synced
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS crm_sync_status INTEGER NOT NULL DEFAULT 1;
