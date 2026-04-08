-- Lead timeline events for admin lead detail modal.

create table if not exists leads_central_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads_central(id) on delete cascade,
  source text,
  event_type text not null default 'lead_update',
  activity_type text,
  funnel_stage text,
  lead_status text,
  actor text,
  payload jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists leads_central_events_lead_event_idx
on leads_central_events (lead_id, event_at desc, created_at desc);

create index if not exists leads_central_events_type_idx
on leads_central_events (event_type, event_at desc);
