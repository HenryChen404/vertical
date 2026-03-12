-- Unified events schema for multi-source calendar/CRM aggregation

-- Merged events table (deduplicated view)
create table merged_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  description text,
  attendees jsonb default '[]'::jsonb,
  related_deal text,
  merge_key text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Source events table (raw per-platform records)
create table event_sources (
  id uuid primary key default gen_random_uuid(),
  merged_event_id uuid not null references merged_events(id) on delete cascade,
  source text not null check (source in ('google_calendar', 'outlook_calendar', 'salesforce')),
  source_id text not null,
  raw_data jsonb default '{}'::jsonb,
  synced_at timestamptz default now(),
  unique (source, source_id)
);

-- Indexes
create index idx_merged_events_start_time on merged_events(start_time);
create index idx_merged_events_merge_key on merged_events(merge_key);
create index idx_event_sources_merged_event_id on event_sources(merged_event_id);
create index idx_event_sources_source on event_sources(source, source_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger merged_events_updated_at
  before update on merged_events
  for each row execute function update_updated_at();
