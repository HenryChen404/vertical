-- Rename merged_events to events
alter table merged_events rename to events;

-- Update foreign key references (event_sources already references via cascade)
-- No change needed for event_sources.merged_event_id column name - rename it too
alter table event_sources rename column merged_event_id to event_id;

-- Recreate indexes with new names
drop index if exists idx_merged_events_start_time;
drop index if exists idx_merged_events_merge_key;
drop index if exists idx_event_sources_merged_event_id;

create index idx_events_start_time on events(start_time);
create index idx_events_merge_key on events(merge_key);
create index idx_event_sources_event_id on event_sources(event_id);

-- Update trigger
drop trigger if exists merged_events_updated_at on events;
create trigger events_updated_at
  before update on events
  for each row execute function update_updated_at();
