-- Email templates and send logs (admin-managed) for transactional + marketing communication.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  channel_type text not null default 'transactional',
  subject_template text not null,
  html_template text not null,
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint email_templates_channel_type_chk
    check (channel_type in ('transactional', 'marketing'))
);

create unique index if not exists email_templates_code_uidx
  on email_templates (lower(code))
  where deleted_at is null;

create unique index if not exists email_templates_name_uidx
  on email_templates (lower(name))
  where deleted_at is null;

create index if not exists email_templates_active_idx
  on email_templates (is_active desc, channel_type, code)
  where deleted_at is null;

create table if not exists email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references email_templates(id) on delete cascade,
  version_number integer not null,
  subject_template text not null,
  html_template text not null,
  change_note text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create index if not exists email_template_versions_template_idx
  on email_template_versions (template_id, version_number desc, created_at desc);

create table if not exists email_send_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete set null,
  template_code text,
  template_name text,
  template_version_number integer,
  template_snapshot jsonb not null default '{}'::jsonb,
  channel_type text,
  recipient_email text not null,
  recipient_athlete_id uuid references athletes(id) on delete set null,
  subject_rendered text,
  body_rendered text,
  render_context jsonb not null default '{}'::jsonb,
  is_test boolean not null default false,
  status text not null default 'queued',
  provider text,
  provider_message_id text,
  provider_error text,
  trigger_source text,
  trigger_ref text,
  actor_identity_id text,
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_send_logs_status_chk
    check (status in ('queued', 'sent', 'failed', 'skipped'))
);

create index if not exists email_send_logs_created_idx
  on email_send_logs (created_at desc);

create index if not exists email_send_logs_template_idx
  on email_send_logs (template_id, created_at desc);

create index if not exists email_send_logs_status_idx
  on email_send_logs (status, created_at desc);

create index if not exists email_send_logs_test_idx
  on email_send_logs (is_test, created_at desc);

create index if not exists email_send_logs_athlete_idx
  on email_send_logs (recipient_athlete_id, created_at desc);

drop trigger if exists set_email_templates_updated_at on email_templates;
create trigger set_email_templates_updated_at
before update on email_templates
for each row execute procedure set_updated_at();

-- Seed one template used by approve-checkin flow so migration enables immediate usage.
insert into email_templates (
  code,
  name,
  description,
  channel_type,
  subject_template,
  html_template,
  is_active
)
select
  'checkin_approved',
  'Check-in aprovado',
  'Notificacao enviada quando o coach aprova o check-in semanal.',
  'transactional',
  'Check-in semanal revisado - semana de {{weekStart}}',
  '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;"><h2 style="color:#c8a415;margin:0 0 16px;">Lion Hybrid Training</h2><p>Ola {{athleteName}},</p><p>O teu coach ja revisou o teu check-in da semana de <strong>{{weekStart}}</strong>.</p><p>Obrigado pelo teu compromisso com o processo!</p><br/><p style="font-size:13px;color:#888;">- Equipa Lion Hybrid Training</p></div>',
  true
where not exists (
  select 1 from email_templates where lower(code) = 'checkin_approved' and deleted_at is null
);

insert into email_template_versions (
  template_id,
  version_number,
  subject_template,
  html_template,
  change_note,
  created_by
)
select
  t.id,
  1,
  t.subject_template,
  t.html_template,
  'Initial seed',
  'migration-email-templates.sql'
from email_templates t
where lower(t.code) = 'checkin_approved'
  and not exists (
    select 1 from email_template_versions v where v.template_id = t.id and v.version_number = 1
  );
