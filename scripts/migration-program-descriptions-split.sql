-- Add commercial/technical description split for training programs.
alter table if exists training_programs
  add column if not exists commercial_description text,
  add column if not exists technical_description text;

-- Preserve historical long text as technical description when empty.
update training_programs
set technical_description = description
where coalesce(nullif(trim(technical_description), ''), '') = ''
  and coalesce(nullif(trim(description), ''), '') <> '';

-- Auto-generate initial commercial summary from technical/legacy text when missing.
-- Heuristic: first sentence up to 180 chars, or fallback to first 180 chars.
update training_programs
set commercial_description = trim(
  case
    when length(
      regexp_replace(
        coalesce(technical_description, description, ''),
        '^\s*((?:.|\n){1,180}?(?:[.!?](?:\s|$)|$)).*$',
        '\1'
      )
    ) > 0
      then regexp_replace(
        coalesce(technical_description, description, ''),
        '^\s*((?:.|\n){1,180}?(?:[.!?](?:\s|$)|$)).*$',
        '\1'
      )
    else left(coalesce(technical_description, description, ''), 180)
  end
)
where coalesce(nullif(trim(commercial_description), ''), '') = ''
  and coalesce(nullif(trim(coalesce(technical_description, description, '')), ''), '') <> '';
