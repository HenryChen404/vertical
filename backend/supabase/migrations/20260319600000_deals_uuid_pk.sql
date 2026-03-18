-- Change deals PK from SF Opportunity ID (text) to UUID
-- Move SF ID to a separate unique column

-- Drop existing triggers and indexes
DROP TRIGGER IF EXISTS deals_updated_at ON deals;
DROP INDEX IF EXISTS idx_deals_user_id;

-- Recreate table with UUID PK
DROP TABLE IF EXISTS deals;

CREATE TABLE deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_opportunity_id text UNIQUE NOT NULL,
  name text NOT NULL,
  amount numeric,
  stage text NOT NULL DEFAULT '',
  close_date date,
  account_id text,
  account_name text DEFAULT '',
  account_revenue numeric,
  account_industry text,
  contacts jsonb DEFAULT '[]'::jsonb,
  user_id uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_deals_user_id ON deals(user_id);
CREATE INDEX idx_deals_sf_opportunity_id ON deals(sf_opportunity_id);

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
