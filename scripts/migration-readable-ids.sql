-- Migration: Name-based readable IDs for athletes, coaches and training programs
-- Goal: readable_id should contain human-recognizable names instead of opaque codes.
--
-- Result examples:
--   athletes.readable_id         = joao-silva
--   coaches.readable_id          = ana-pereira
--   training_programs.readable_id= base-10k
--
-- Notes:
-- - UUID remains the PK/FK source of truth.
-- - readable_id is unique and slug-like.
-- - If a slug already exists, numeric suffix is appended (e.g. joao-silva-2).

alter table athletes add column if not exists readable_id text;
alter table coaches add column if not exists readable_id text;
alter table training_programs add column if not exists readable_id text;

create or replace function normalize_readable_slug(raw_value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(
      translate(
        coalesce(raw_value, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
      )
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

create or replace function generate_unique_readable_id(
  target_table regclass,
  base_value text,
  current_id uuid default null
)
returns text
language plpgsql
as $$
declare
  base_slug text;
  candidate text;
  n integer := 1;
  is_taken boolean;
  where_self_clause text := '';
begin
  base_slug := normalize_readable_slug(base_value);
  if base_slug = '' then
    base_slug := 'sem-nome';
  end if;

  if current_id is not null then
    where_self_clause := ' and id <> $2';
  end if;

  loop
    if n = 1 then
      candidate := base_slug;
    else
      candidate := base_slug || '-' || n::text;
    end if;

    if current_id is null then
      execute format(
        'select exists(select 1 from %s where readable_id = $1)',
        target_table
      )
      into is_taken
      using candidate;
    else
      execute format(
        'select exists(select 1 from %s where readable_id = $1%s)',
        target_table,
        where_self_clause
      )
      into is_taken
      using candidate, current_id;
    end if;

    if not is_taken then
      return candidate;
    end if;

    n := n + 1;
  end loop;
end;
$$;

create or replace function set_name_based_readable_id()
returns trigger
language plpgsql
as $$
declare
  base_value text;
begin
  if tg_table_name = 'athletes' then
    base_value := coalesce(new.name, new.email, new.id::text);
  elsif tg_table_name = 'coaches' then
    base_value := coalesce(new.name, new.email, new.identity_id, new.id::text);
  elsif tg_table_name = 'training_programs' then
    base_value := coalesce(new.name, new.external_id, new.id::text);
  else
    return new;
  end if;

  if new.readable_id is null or new.readable_id = '' then
    new.readable_id := generate_unique_readable_id(tg_table_name::regclass, base_value, new.id);
  end if;

  return new;
end;
$$;

-- Backfill null/legacy code-like readable_id values into name-based slugs.
update athletes a
set readable_id = generate_unique_readable_id('athletes'::regclass, coalesce(a.name, a.email, a.id::text), a.id)
where a.readable_id is null
   or a.readable_id = ''
   or a.readable_id ~ '^ATH-[0-9]+$';

update coaches c
set readable_id = generate_unique_readable_id('coaches'::regclass, coalesce(c.name, c.email, c.identity_id, c.id::text), c.id)
where c.readable_id is null
   or c.readable_id = ''
   or c.readable_id ~ '^COA-[0-9]+$';

update training_programs tp
set readable_id = generate_unique_readable_id('training_programs'::regclass, coalesce(tp.name, tp.external_id, tp.id::text), tp.id)
where tp.readable_id is null
   or tp.readable_id = ''
   or tp.readable_id ~ '^PRG-[0-9]+$';

alter table athletes alter column readable_id set not null;
alter table coaches alter column readable_id set not null;
alter table training_programs alter column readable_id set not null;

create unique index if not exists athletes_readable_id_uidx
on athletes (readable_id);

create unique index if not exists coaches_readable_id_uidx
on coaches (readable_id);

create unique index if not exists training_programs_readable_id_uidx
on training_programs (readable_id);

create index if not exists athletes_readable_id_idx
on athletes (readable_id, name);

create index if not exists coaches_readable_id_idx
on coaches (readable_id, name)
where deleted_at is null;

create index if not exists training_programs_readable_id_idx
on training_programs (readable_id, name)
where deleted_at is null;

drop trigger if exists set_athletes_readable_id on athletes;
create trigger set_athletes_readable_id
before insert or update of readable_id on athletes
for each row
execute function set_name_based_readable_id();

drop trigger if exists set_coaches_readable_id on coaches;
create trigger set_coaches_readable_id
before insert or update of readable_id on coaches
for each row
execute function set_name_based_readable_id();

drop trigger if exists set_training_programs_readable_id on training_programs;
create trigger set_training_programs_readable_id
before insert or update of readable_id on training_programs
for each row
execute function set_name_based_readable_id();
