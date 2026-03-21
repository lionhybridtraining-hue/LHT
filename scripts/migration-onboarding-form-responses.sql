create table if not exists onboarding_form_responses (
  id uuid primary key default gen_random_uuid(),
  identity_id text not null unique,
  email text not null,

  nome_completo text,
  sexo text,
  telemovel text,
  data_nascimento date,

  peso_kg numeric(6,2),
  peso_ideal_kg numeric(6,2),
  altura_m numeric(4,2),
  massa_gorda_percent numeric(5,2),
  perimetro_abdominal_cm numeric(6,2),

  profissao text,
  nivel_atividade_diaria text,
  media_passos_diarios text,
  habitos_ajudam text,
  habitos_atrapalham text,

  horas_sono_media numeric(4,2),
  qualidade_sono integer,
  sono_reparador text,

  qualidade_alimentacao integer,
  padrao_alimentar text[] default '{}'::text[],
  apetites_dia text,
  melhoria_alimentacao text,
  litros_agua_dia numeric(4,2),
  dificuldade_hidratacao text,
  suplementos text[] default '{}'::text[],
  opiniao_suplementacao text,

  condicao_saude_diagnosticada text,
  checkup_recente text,
  medicacao_diaria text,
  acompanhamento_profissional text,
  lesao_atual text,
  dores_regulares text,
  intervencao_cirurgica text,
  sintomas_treino text[] default '{}'::text[],
  condicao_mental_emocional text,

  treina_ginasio_atualmente text,
  tempo_consistencia_treino text,
  experiencia_ginasio text,
  desporto_regular text,
  acompanhamento_pt text,
  partilha_experiencia_treino text,

  porque_agora text,
  mudanca_desejada text,
  tentativas_anteriores text,
  auto_sabotagem text[] default '{}'::text[],
  falo_comigo_dificil text[] default '{}'::text[],
  gatilho_dias_dificeis text,
  frase_motivacao text,
  maior_objetivo text,
  notas_finais text,

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_form_responses_submitted_idx
on onboarding_form_responses (submitted_at desc);

create index if not exists onboarding_form_responses_email_idx
on onboarding_form_responses (email);

create index if not exists onboarding_form_responses_phone_idx
on onboarding_form_responses (telemovel)
where telemovel is not null;

create index if not exists onboarding_form_responses_nascimento_idx
on onboarding_form_responses (data_nascimento)
where data_nascimento is not null;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_onboarding_form_responses_updated_at on onboarding_form_responses;
create trigger set_onboarding_form_responses_updated_at
before update on onboarding_form_responses
for each row
execute function set_updated_at();
