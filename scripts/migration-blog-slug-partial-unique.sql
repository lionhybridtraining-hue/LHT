alter table public.blog_articles
  drop constraint if exists blog_articles_slug_key;

drop index if exists public.blog_articles_slug_uidx;

create unique index if not exists blog_articles_slug_uidx
on public.blog_articles (slug)
where deleted_at is null;
