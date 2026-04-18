# Frontend Data Flow: atleta, coach e admin

Atualizado: 2026-04-18

Este documento existe para responder a 4 perguntas de forma simples:

1. Que dados o frontend recolhe?
2. Onde esses dados sao guardados?
3. Onde esses dados sao tratados?
4. Quando o frontend volta a pedir os dados?

Nao e um inventario completo de todos os endpoints. E um mapa mental para conseguires orientar correcoes, debugging e melhorias.

---

## Regra base do sistema

Na maior parte dos fluxos, o ciclo e este:

1. O browser recolhe dados do utilizador ou do dispositivo.
2. O frontend envia esses dados para uma Netlify Function.
3. A function valida, transforma e guarda em Supabase.
4. O frontend faz novo `GET` quando precisas de ver o estado atualizado.

Formula curta:

`frontend -> function -> Supabase -> frontend`

Quase nunca tens logica pesada de negocio guardada no browser. O browser monta payloads e renderiza respostas. A validacao, agregacao e persistencia importantes vivem maioritariamente nas functions.

---

## 1. Atleta

## O que o frontend recolhe

Principais dados recolhidos no lado do atleta:

- autenticacao e sessao Google/Supabase
- onboarding e preferencias de treino
- perfil base do atleta
- logs de treino de forca: series, reps, carga, RIR, data
- respostas de check-in
- ligacao a Strava
- navegacao de semana/programa selecionado

Pontos de entrada uteis:

- `aer-frontend-main/src/pages/home.tsx`
- `aer-frontend-main/src/pages/atleta/calendario.tsx`
- `aer-frontend-main/src/services/athlete-strength.ts`
- `aer-frontend-main/src/services/athlete-schedule.ts`
- `aer-frontend-main/src/services/athlete-profile.ts`

## Onde e guardado

Normalmente em Supabase:

- `athletes`
- `onboarding_intake`
- `program_assignments`
- `athlete_weekly_plan`
- `strength_plan_instances`
- `strength_log_sets`
- `weekly_checkins`
- `athlete_strava_connections`
- `training_sessions`
- `training_load_daily`
- `training_load_metrics`

Tambem pode existir estado local no browser para UX:

- sessao Supabase
- drafts temporarios
- fila offline de logs de forca

## Onde e tratado

Tratamento principal no backend:

- as functions validam payloads
- geram ou materializam calendario semanal
- calculam carga de treino e metricas
- transformam logs em historico utilizavel
- fazem sync com Strava

Em termos praticos: o frontend raramente faz calculo estrutural do sistema. O frontend recolhe, mostra e pede novamente.

## Quando e pedido outra vez

O frontend do atleta volta a pedir dados quando:

- a pagina abre
- o atleta muda de semana
- o atleta seleciona outro plano/instancia
- um treino e registado ou concluido
- um check-in e submetido
- ha sync/manual refresh de Strava
- o utilizador volta a entrar na app

## Resumo simples do fluxo atleta

1. O atleta preenche ou regista algo no browser.
2. O browser envia para uma function.
3. A function escreve em Supabase e recalcula o que for necessario.
4. O frontend faz novo fetch para mostrar o estado atualizado.

---

## 2. Coach

## O que o frontend recolhe

O dashboard `/coach` recolhe sobretudo dados operacionais:

- selecao de atleta
- upload CSV de treino
- zonas de treino: LTHR, FC max, FC rest, pace limiar, VDOT
- valores de 1RM
- VDOT manual
- criacao/edicao de planos de forca
- criacao/edicao de templates de corrida
- variantes de programas
- presets de calendario e sessoes por dia
- criacao e gestao de assignments/instancias

Ponto de entrada principal:

- `coach/index.html`

## Onde e guardado

Normalmente em Supabase:

- `athletes`
- `athlete_training_zone_profiles`
- `athlete_training_zones`
- `athlete_exercise_1rm`
- `athlete_running_vdot_history`
- `strength_plans`
- `strength_plan_exercises`
- `strength_prescriptions`
- `strength_plan_instances`
- `running_plan_templates`
- `running_workout_templates`
- `running_plan_instances`
- `running_workout_instances`
- `training_programs`
- `program_variants`
- `program_schedule_presets`
- `program_schedule_slots`
- `program_assignments`
- `athlete_weekly_plan`
- `training_sessions`
- `training_load_daily`
- `training_load_metrics`
- `weekly_checkins`

## Onde e tratado

Tratamento principal em Netlify Functions:

- o upload CSV parseia, normaliza, deduplica e recalcula carga
- o backend gera calendario materializado a partir de assignment + preset + variante
- updates de VDOT e 1RM influenciam calculos e recomendacoes futuras
- criacao de instancias transforma templates em objetos ativos por atleta
- os endpoints agregados reduzem a complexidade de leitura do frontend

## Endpoints agregados importantes

Desde Abril 2026 existe uma camada de agregacao para o coach:

- `coach-program-blueprint`
- `coach-athlete-profile-unified`
- `coach-calendar-week`

Objetivo destes endpoints:

- esconder combinacoes de varias tabelas
- reduzir chamadas separadas no frontend
- devolver payloads mais proximos do que a UI precisa

Importante: estes endpoints sao de leitura. As escritas continuam a passar pelos endpoints especificos de cada feature.

## Quando e pedido outra vez

No coach, quase tudo e refetch manual ou orientado por interacao:

- quando escolhes outro atleta
- quando mudas de semana
- quando abres uma tab que lazy-load dados
- depois de guardar zonas
- depois de guardar 1RM
- depois de atualizar VDOT
- depois de criar/editar planos, variantes, presets ou assignments
- quando clicas em refresh

## Resumo simples do fluxo coach

1. O coach altera ou cria dados no browser.
2. O browser envia para a function da feature.
3. A function guarda em Supabase e, se preciso, recalcula estado derivado.
4. O frontend faz novo fetch e redesenha a area afetada.

---

## 3. Admin

## O que o frontend recolhe

O `/admin` recolhe dados de operacao e backoffice:

- login admin
- conteudo editorial do blog
- categorias do blog
- metadados do site
- programas, variantes, precos e IDs externos
- atletas, coaches e atribuicoes
- eventos, leads e funil
- emails, templates e testes de envio
- filtros de listagens e dashboards

Ponto de entrada principal:

- `admin/index.html`

## Onde e guardado

Normalmente em Supabase:

- `blog_articles`
- `blog_categories`
- `site_content`
- `training_programs`
- `program_variants`
- `program_assignments`
- `athletes`
- `coaches`
- `leads_central`
- `lead_events`
- `login_events`
- tabelas auxiliares de notificacoes, emails e operacoes

Tambem existe persistencia fora de Supabase em alguns fluxos:

- Stripe para produtos, precos, compras e subscricoes
- storage para imagens e assets quando aplicavel

## Onde e tratado

Tratamento principal nas functions admin:

- CRUD de blog e categorias
- agregacao de atletas/programas/assignments para listagens administrativas
- sincronizacao e reconciliacao com Stripe
- calculo de dashboards de retencao e funil
- preparacao de previews e envios de email

## Quando e pedido outra vez

No admin, os refetches aparecem sobretudo quando:

- abres uma tab nova
- aplicas filtros ou pesquisa
- guardas um registo e a lista tem de ser atualizada
- mudas intervalo temporal num dashboard
- clicas em refresh manual

## Resumo simples do fluxo admin

1. O admin edita, cria ou filtra dados no browser.
2. O browser chama a function da area.
3. A function valida, agrega e escreve em Supabase ou Stripe.
4. O frontend volta a pedir a listagem ou o detalhe atualizado.

---

## 4. Glossario de niveis e experiencias

Esta e a zona onde mais facilmente se mistura sem querer conceitos diferentes.

Resumo curto:

- `experienceLevel` = nome camelCase usado em payloads/frontend
- `experience_level` = nome snake_case usado em colunas e alguns payloads backend
- `strengthLevel` = nivel de forca do atleta para personalizacao de treino de forca
- `coach_strength_level_override` = override do coach sobre o nivel de forca do atleta
- `program_variants.experience_level` = nivel da variante do programa
- `training_programs.classification.experienceLevel` = classificacao editorial/comercial do programa

## 4.1 Nivel de experiencia do atleta

Campos/aliases usados:

- `experienceLevel`
- `experience_level`

Onde o utilizador o introduz no frontend:

- `aer-frontend-main/src/pages/plan-landing.tsx`
- `assets/js/onboarding.js`

Valores visiveis ao utilizador em fluxos de onboarding/landing:

- `starter`
- `building`
- `performance`

Aliases aceites no backend durante normalizacao:

- `iniciante` e `beginner` -> `starter`
- `intermedio` e `intermediate` -> `building`
- `avancado` e `advanced` -> `performance`

Onde fica guardado em Supabase:

- `athletes.experience_level`
- `athletes.onboarding_answers`

Como pensar nele:

- este campo representa o nivel global de experiencia do atleta no onboarding
- nao e um nivel tecnico especifico de forca
- nao e a mesma coisa que o nivel das variantes de programa

## 4.2 Nivel de forca do atleta

Campos/aliases usados:

- `strengthLevel`
- `strength_level`

Onde o utilizador o introduz no frontend:

- `aer-frontend-main/src/pages/atleta/perfil.tsx`

Valores canonicos:

- `beginner`
- `intermediate`
- `advanced`

Onde fica guardado em Supabase:

- `athletes.strength_level`

Como pensar nele:

- este campo existe para adaptar o plano de forca ao nivel atual do atleta
- e independente do `experienceLevel` do onboarding
- e o campo que a app de forca usa mais diretamente para adaptacoes

## 4.3 Override do coach sobre o nivel de forca

Campos/aliases usados:

- `coachStrengthLevelOverride`
- `coach_strength_level_override`

Onde o coach o introduz no frontend:

- `coach/index.html`

Valores canonicos:

- `beginner`
- `intermediate`
- `advanced`
- `null`

Onde fica guardado em Supabase:

- `athletes.coach_strength_level_override`

Como pensar nele:

- este campo sobrepoe a preferencia base `athletes.strength_level`
- serve para o coach forcar uma adaptacao mais conservadora ou mais avancada
- e um campo de planeamento/execucao, nao de onboarding

## 4.4 Nivel da variante do programa

Campos/aliases usados:

- `experience_level`
- no frontend React tambem aparece como filtro `experienceLevel`

Onde e definido no frontend:

- `coach/index.html` no modal de criacao/edicao de variantes

Valores canonicos:

- `beginner`
- `intermediate`
- `advanced`

Onde fica guardado em Supabase:

- `program_variants.experience_level`

Como pensar nele:

- este campo nao descreve o atleta
- descreve para que tipo de atleta aquela variante foi desenhada
- cruza com `duration_weeks` e `weekly_frequency`
- e parte da chave funcional da variante

## 4.5 Classificacao de experiencia do programa

Campos/aliases usados:

- `classification.experienceLevel.overall`
- `classification.experienceLevel.byModality`

Onde e definido no frontend:

- `admin/index.html` no form de criar programa
- `admin/index.html` no form de editar programa

Valores canonicos:

- `beginner`
- `intermediate`
- `advanced`

Formato guardado em Supabase:

- `training_programs.classification` (JSONB)

Exemplos de estrutura:

```json
{
	"experienceLevel": {
		"overall": "intermediate",
		"byModality": {
			"gym": ["beginner", "intermediate"],
			"run": "advanced"
		}
	}
}
```

Como pensar nele:

- este campo e editorial/comercial e tambem ajuda nos filtros de catalogo
- pode existir por modalidade e nao apenas como um valor unico
- nao substitui `program_variants.experience_level`
- nao substitui `athletes.experience_level`

## 4.6 Mapa rapido para nao confundir

Se a pergunta for "que experiencia tem este atleta?":

- olha para `athletes.experience_level`

Se a pergunta for "que nivel de forca deve adaptar o treino deste atleta?":

- olha para `athletes.strength_level`
- e depois para `athletes.coach_strength_level_override` se existir

Se a pergunta for "esta variante foi desenhada para que nivel?":

- olha para `program_variants.experience_level`

Se a pergunta for "como este programa e apresentado/classificado no catalogo?":

- olha para `training_programs.classification.experienceLevel`

## 4.7 Tabela-resumo

| Conceito | Nome usado no frontend | Valores | Guardado em Supabase | Dono funcional |
|---|---|---|---|---|
| Experiencia global do atleta | `experienceLevel` / `experience_level` | `starter` · `building` · `performance` | `athletes.experience_level` + `athletes.onboarding_answers` | onboarding do atleta |
| Nivel de forca do atleta | `strengthLevel` / `strength_level` | `beginner` · `intermediate` · `advanced` | `athletes.strength_level` | perfil/forca do atleta |
| Override do coach | `coachStrengthLevelOverride` / `coach_strength_level_override` | `beginner` · `intermediate` · `advanced` | `athletes.coach_strength_level_override` | coach |
| Nivel da variante | `experience_level` | `beginner` · `intermediate` · `advanced` | `program_variants.experience_level` | planeamento de variantes |
| Classificacao do programa | `classification.experienceLevel` | `beginner` · `intermediate` · `advanced` | `training_programs.classification` | admin/catalogo |

---

## Como pensar no sistema sem te perderes

Quando houver um bug ou uma melhoria, comeca sempre por estas 5 perguntas:

1. Quem recolhe o dado: atleta, coach ou admin?
2. O dado nasce no browser, numa API externa, ou ja vem da base de dados?
3. Que function recebe esse dado primeiro?
4. Em que tabela ou recurso fica persistido?
5. Que `GET` posterior volta a ler esse dado para a UI?

Se responderes a estas 5 perguntas, normalmente ja sabes onde mexer.

---

## Atalhos de debugging

## Se o problema e "o dado nao ficou guardado"

Verifica:

- payload enviado pelo frontend
- function que recebe esse payload
- validacoes e transformacoes na function
- tabela final em Supabase

## Se o problema e "o dado foi guardado mas nao aparece"

Verifica:

- endpoint de leitura usado pela UI
- se a UI faz refetch depois do save
- se existe cache local/estado antigo
- se o endpoint agregado esta a esconder ou remapear campos

## Se o problema e "o valor aparece errado"

Verifica:

- se o erro nasce no input do browser
- se a function recalcula ou normaliza esse valor
- se a UI esta a usar o campo certo na resposta
- se ha diferenca entre endpoint legado e endpoint agregado

---

## Ficheiros para abrir primeiro

Se quiseres reconstruir rapidamente um fluxo, abre por esta ordem:

1. frontend da area
2. service/helper dessa area
3. function chamada pelo frontend
4. helper em `netlify/functions/_lib/`
5. tabela alvo no schema/migrations

Pontos de partida praticos:

- atleta: `aer-frontend-main/src/pages/atleta/` e `aer-frontend-main/src/services/`
- coach: `coach/index.html`
- admin: `admin/index.html`
- backend: `netlify/functions/`
- agregacao: `netlify/functions/_lib/view-models.js`

---

## Documento relacionado

Para contexto mais estrutural:

- `ARCHITECTURE.md`
- `README-COACH-UPLOAD-FLOW.md`
- `README-ADMIN-FUNIL-E-RETENCAO.md`
- `README-STRAVA-DADOS-E-TSS.md`
