alter table training_programs
  alter column duration_weeks drop not null;

alter table training_programs
  drop constraint if exists training_programs_duration_weeks_check;

alter table training_programs
  add constraint training_programs_duration_weeks_check
  check (duration_weeks is null or duration_weeks > 0);