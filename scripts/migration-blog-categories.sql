-- Blog category registry for admin CRUD.

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

create table if not exists blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists blog_categories_name_uidx
  on blog_categories (lower(name))
  where deleted_at is null;

create index if not exists blog_categories_active_idx
  on blog_categories (is_locked desc, name)
  where deleted_at is null;

drop trigger if exists set_blog_categories_updated_at on blog_categories;
create trigger set_blog_categories_updated_at
before update on blog_categories
for each row execute procedure set_updated_at();

insert into blog_categories (name, is_locked)
select 'Artigo', true
where not exists (
  select 1 from blog_categories where lower(name) = lower('Artigo') and deleted_at is null
);

update blog_categories
set is_locked = true,
    deleted_at = null
where lower(name) = lower('Artigo');

insert into blog_categories (name, is_locked)
select distinct trim(category) as name, false
from blog_articles
where deleted_at is null
  and coalesce(trim(category), '') <> ''
  and lower(trim(category)) <> lower('Artigo')
  and not exists (
    select 1
    from blog_categories bc
    where bc.deleted_at is null
      and lower(bc.name) = lower(trim(blog_articles.category))
  );