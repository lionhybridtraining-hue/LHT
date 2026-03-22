-- Migration v2: Support 3 generation modes (abc_from_article, draft_from_idea, abc_standalone)
-- Makes article_id nullable and adds generation_mode + extra_instructions columns.

-- 1. Drop existing unique constraint on article_id
alter table public.blog_content_production
  drop constraint if exists blog_content_production_article_id_key;

-- 2. Drop existing foreign key (will re-add as nullable-friendly)
alter table public.blog_content_production
  drop constraint if exists blog_content_production_article_id_fkey;

-- 3. Make article_id nullable
alter table public.blog_content_production
  alter column article_id drop not null;

-- 4. Re-add FK (nullable column + ON DELETE CASCADE)
alter table public.blog_content_production
  add constraint blog_content_production_article_id_fkey
  foreign key (article_id) references public.blog_articles(id) on delete cascade;

-- 5. Partial unique index: 1:1 for article-linked records, allows multiple NULLs
create unique index if not exists blog_content_production_article_id_uq
  on public.blog_content_production(article_id)
  where article_id is not null;

-- 6. Add generation_mode column
alter table public.blog_content_production
  add column if not exists generation_mode text not null default 'full';

alter table public.blog_content_production
  drop constraint if exists blog_content_production_mode_chk;

alter table public.blog_content_production
  add constraint blog_content_production_mode_chk
  check (generation_mode in ('full', 'abc_from_article', 'draft_from_idea', 'abc_standalone'));

-- 7. Add extra_instructions column
alter table public.blog_content_production
  add column if not exists extra_instructions text not null default '';

-- 8. Index on generation_mode for filtering standalone records
create index if not exists idx_blog_content_production_mode
  on public.blog_content_production(generation_mode);

-- 9. Index for listing standalone records (article_id IS NULL)
create index if not exists idx_blog_content_production_standalone
  on public.blog_content_production(updated_at desc)
  where article_id is null;
