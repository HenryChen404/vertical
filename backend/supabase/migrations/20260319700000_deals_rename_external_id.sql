-- Rename sf_opportunity_id to external_id for CRM-agnostic abstraction
ALTER TABLE deals RENAME COLUMN sf_opportunity_id TO external_id;
ALTER INDEX idx_deals_sf_opportunity_id RENAME TO idx_deals_external_id;
