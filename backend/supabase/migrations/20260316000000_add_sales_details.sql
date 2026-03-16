-- Add sales_details JSONB column to store enriched Salesforce data
-- (Account, Opportunity, Participants from related entities)
alter table events add column if not exists sales_details jsonb default null;
