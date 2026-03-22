create table if not exists public.blog_content_production (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null unique references public.blog_articles(id) on delete cascade,
  status text not null default 'not_generated',
  briefing_data jsonb not null default '{}'::jsonb,
  generated_blog jsonb not null default '{}'::jsonb,
  whatsapp_variants jsonb not null default '[]'::jsonb,
  selected_variant text,
  regenerate_on_publish boolean not null default true,
  manual_shared_at timestamptz,
  generation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_content_production_status_chk
    check (status in ('not_generated', 'generated', 'shared_manual', 'failed_generation')),
  constraint blog_content_production_selected_variant_chk
    check (selected_variant is null or selected_variant in ('A', 'B', 'C'))
);

create index if not exists idx_blog_content_production_status
  on public.blog_content_production(status);

create index if not exists idx_blog_content_production_updated_at
  on public.blog_content_production(updated_at desc);

create or replace function public.blog_content_production_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_blog_content_production_set_updated_at
  on public.blog_content_production;

create trigger trg_blog_content_production_set_updated_at
before update on public.blog_content_production
for each row
execute function public.blog_content_production_set_updated_at();
