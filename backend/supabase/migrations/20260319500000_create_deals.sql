-- Create deals table for Salesforce Opportunities
CREATE TABLE deals (
  id text PRIMARY KEY,
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

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
