-- Merge account_id, account_name, account_revenue, account_industry into a single JSONB column
ALTER TABLE deals ADD COLUMN account jsonb DEFAULT '{}'::jsonb;

-- Migrate existing data
UPDATE deals SET account = jsonb_build_object(
  'id', COALESCE(account_id, ''),
  'name', COALESCE(account_name, ''),
  'revenue', account_revenue,
  'industry', COALESCE(account_industry, '')
);

-- Drop old columns
ALTER TABLE deals DROP COLUMN account_id;
ALTER TABLE deals DROP COLUMN account_name;
ALTER TABLE deals DROP COLUMN account_revenue;
ALTER TABLE deals DROP COLUMN account_industry;
