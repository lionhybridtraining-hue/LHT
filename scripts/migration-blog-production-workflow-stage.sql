alter table public.blog_content_production
  add column if not exists workflow_stage text not null default 'idea';

alter table public.blog_content_production
  drop constraint if exists blog_content_production_workflow_stage_chk;

alter table public.blog_content_production
  add constraint blog_content_production_workflow_stage_chk
  check (workflow_stage in ('idea', 'draft_ready', 'article_saved', 'published', 'abc_ready', 'variant_selected', 'shared_manual'));

update public.blog_content_production
set workflow_stage = 'shared_manual'
where manual_shared_at is not null;

update public.blog_content_production
set workflow_stage = 'variant_selected'
where workflow_stage = 'idea'
  and selected_variant in ('A', 'B', 'C');

update public.blog_content_production
set workflow_stage = 'abc_ready'
where workflow_stage = 'idea'
  and (
    status in ('generated', 'failed_generation')
    or jsonb_array_length(coalesce(whatsapp_variants, '[]'::jsonb)) > 0
  );

update public.blog_content_production
set workflow_stage = 'article_saved'
where workflow_stage = 'idea'
  and article_id is not null;

update public.blog_content_production
set workflow_stage = 'draft_ready'
where workflow_stage = 'idea'
  and generated_blog is not null
  and coalesce(nullif(generated_blog->>'title', ''), nullif(generated_blog->>'content', '')) is not null;

create index if not exists idx_blog_content_production_workflow_stage
  on public.blog_content_production(workflow_stage);