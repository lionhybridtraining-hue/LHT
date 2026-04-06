# Strava: Inventario de Dados e Plano de Uso (Carga + Adesao)

Data: 2026-04-04  
Escopo desta fase: ingestao de atividades Strava para historico, carga (CTL/ATL/TSB) e adesao ao plano semanal.  
Fora de escopo: envio de treinos estruturados e sincronizacao com Garmin.

## 1) Objetivo

Este documento define:

1. Quais dados conseguimos receber da Strava no fluxo atual.
2. Quais dados conseguimos derivar automaticamente.
3. Quais dados dependem de metricas individuais do atleta.
4. Como usar cada dado para carga de treino e adesao ao plano.
5. Qual estrategia de TSS sera adotada apos aprovacao.

Principio obrigatorio desta fase:

1. Nao usar TSS calculado por plataformas externas como valor final de carga.
2. Todo o calculo de TSS e feito no backend LHT, com formulas baseadas na metodologia TrainingPeaks.

## 2) Fontes de dados Strava no sistema atual

## 2.1 Endpoints usados

1. `GET /athlete/activities` (sync manual, paginado)
2. `GET /activities/{id}` (webhook create/update)
3. Webhook Strava (eventos `activity:create|update|delete`)

## 2.2 Pipeline atual

1. OAuth e tokens em `athlete_strava_connections`.
2. Mapeamento da atividade para `training_sessions` via `mapStravaActivityToSession`.
3. Upsert idempotente por `(athlete_id, source, source_session_id)`.
4. Recalculo completo de `training_load_daily` e `training_load_metrics`.

## 3) Inventario de dados

## 3.1 Dados recebidos diretamente e ja mapeados para training_sessions

1. Identificacao
- `activity.id` -> `source_session_id`
- `source = "strava"`

2. Datas
- `start_date_local` (fallback `start_date`) -> `session_date` (ISO date)

3. Tipo e descricao
- `name` -> `title`
- `sport_type` (fallback `type`) -> `sport_type`

4. Volume
- `moving_time` (fallback `elapsed_time`) -> `duration_minutes` e `actual_duration_minutes`
- `distance` (m) -> `actual_distance_meters`
- `distance` (m) -> `distance_km` (derivado direto)

5. Intensidade/carga
- `suffer_score` -> armazenado apenas como referencia no `source_payload` (nao usado como fonte final de `tss`)
- `average_heartrate` -> `avg_heart_rate`
- `average_watts` -> `avg_power`
- `kilojoules` -> `work_kj`

6. Auditoria
- Objeto completo da atividade -> `source_payload`

## 3.2 Dados recebidos mas ainda nao usados como coluna principal

1. `elapsed_time` (quando diferente de moving_time)
2. `total_elevation_gain`
3. `average_cadence`
4. `max_heartrate`
5. `max_watts`
6. `device_name`
7. `workout_type`
8. `map` (resumo de GPS)
9. `splits_metric` / `splits_standard` (quando presentes no detalhe)

Observacao: estes campos podem ficar inicialmente em `source_payload` e ser promovidos para coluna apenas se houver uso recorrente em query/relatorio.

## 3.3 Dados derivados que podemos calcular ja

1. Pace medio (texto) a partir de distancia e moving_time
- Formula base: `pace_min_km = moving_time / 60 / (distance_m / 1000)`
- Formato sugerido: `mm:ss /km`
- Uso: preencher `avg_pace` para corrida.

2. Separacao moving vs elapsed
- Derivar `moving_ratio = moving_time / elapsed_time` quando possivel.
- Uso: qualidade de execucao e contexto de sessao.

3. Classificacao de contexto de corrida
- Exemplo: `easy|tempo|interval|long|unknown` com heuristica inicial por sport type + duracao + (futuro) intensidade.

## 3.4 Dados que dependem de configuracao individual do atleta

1. TSS por potencia (pTSS)
- Requer referencia individual (FTP ou equivalente de limiar de potencia).

2. TSS por pace (rTSS)
- Requer pace limiar de corrida (threshold pace) ou modelo robusto baseado em VDOT.

3. TSS por frequencia cardiaca (hTSS)
- Requer LTHR e zonas FC bem definidas.

4. IF (Intensity Factor)
- Requer metrica de limiar consistente por metodo (potencia, pace ou FC).

## 4) Estado atual da carga (CTL/ATL/TSB)

1. O motor de carga atual usa `training_sessions.tss` como entrada principal.
2. CTL e ATL sao calculados por media exponencial (constantes atuais mantidas).
3. TSB/fadiga e derivado de `ctl - atl`.
4. Sem TSS de entrada valido, a carga diaria pode ficar subestimada.

Conclusao: antes de ligar fallback automatico de TSS, precisamos de regra aprovada para evitar contaminar a carga com estimativas fracas.

## 5) Estrategia de TSS calculada no backend (TrainingPeaks-based)

## 5.1 Regra geral

1. O campo `tss` em `training_sessions` e sempre calculado no backend LHT.
2. Qualquer TSS vindo de fora (ex: `suffer_score`) e apenas informativo e nunca sobrescreve a formula backend.
3. O metodo usado por sessao deve ser guardado em metadados (`power|run_pace|swim_speed|heart_rate|none`).

## 5.2 Formulas por modalidade

### A) Ciclismo e remo com potencia (TSS classico)

Formula de referencia TrainingPeaks:

`IF_power = NP / FTP`

`TSS_power = (sec x NP x IF_power) / (FTP x 3600) x 100`

Forma equivalente:

`TSS_power = horas x IF_power^2 x 100`

Entradas obrigatorias:

1. Serie de potencia para obter NP.
2. FTP valido para a data da sessao.

### B) Corrida (rTSS)

Referencia TrainingPeaks: rTSS usa NGP (Normalized Graded Pace) relativo ao pace limiar funcional.

Para evitar erro de inversao de unidades de pace, a implementacao deve ser em velocidade:

`NGS = velocidade normalizada em subida/descida (derivada do NGP)`

`ThresholdSpeed = velocidade no limiar funcional de corrida`

`IF_run = NGS / ThresholdSpeed`

`rTSS = horas x IF_run^2 x 100`

Equivalencia conceitual com a formula geral TP:

`rTSS = (sec x NGP_metric x IF_run) / (ThresholdPace_metric x 3600) x 100`

Entradas obrigatorias:

1. Pace/velocidade com ajuste de grade (NGP/NGS).
2. Threshold pace (ou velocidade limiar) valido para a data da sessao.

### C) Natacao (sTSS)

Referencia TrainingPeaks (manual swim TSS):

1. `NSS = distancia_m / moving_minutes` (velocidade normalizada de nado, sem descansos)
2. `IF_swim = NSS / SwimThresholdSpeed`
3. `sTSS = horas_moving x IF_swim^3 x 100`

Entradas obrigatorias:

1. Distancia total de nado.
2. Tempo em movimento (sem descansos, quando disponivel).
3. Threshold speed de natacao do atleta (m/min ou m/s, com conversao consistente).

### D) Modalidades sem potencia/pace limiar (hrTSS fallback)

Referencia TrainingPeaks: hrTSS e baseado em tempo nas zonas de FC relativas ao LTHR.

Formula operacional backend:

`hrTSS = sum(tempo_zona_horas x fator_zona x 100)`

Onde:

1. As zonas sao derivadas de LTHR do atleta.
2. `fator_zona` segue tabela calibrada no backend conforme metodologia TrainingPeaks para estimativa por FC.

Entradas obrigatorias:

1. Serie de FC valida.
2. LTHR valido e zonas FC configuradas.

## 5.3 Selecao de metodo por sessao

1. Bike/Row com potencia valida -> `power`.
2. Run com NGP/threshold pace valido -> `run_pace`.
3. Swim com threshold speed valido -> `swim_speed`.
4. Restantes com FC + LTHR/zonas validas -> `heart_rate`.
5. Se faltar base minima -> `none` e `tss = null`.

## 5.4 Regras de seguranca

1. Nunca calcular TSS sem threshold valido para o metodo escolhido.
2. Nunca misturar duas formulas na mesma sessao.
3. Persistir em metadados: metodo, thresholds usados e versao da formula.
4. Logar contagem de sessoes por metodo em cada sync.

## 6) Adesao ao plano semanal (regra inicial aprovada)

Regra inicial pedida:

1. Match de sessao do mesmo tipo no mesmo dia.
2. Avaliar grau de adesao por duracao e TSS.

Implementacao recomendada (conservadora):

1. Procurar em `athlete_weekly_plan` sessoes `running` com `status = planned` no mesmo dia (`week_start_date + day_of_week`).
2. Se houver uma unica candidata clara, marcar `completed`.
3. Se houver ambiguidade (multiplas candidatas ou multiplas atividades concorrentes), nao auto-completar.
4. Persistir no `running_session_data` metadados do match (atividade Strava, duracao real, distancia real, TSS, timestamp do match, confianca).

Criterios de grau de adesao (primeira versao):

1. Duracao: comparar `actual_duration_minutes` com `duration_estimate_min`.
2. TSS: comparar TSS real da atividade com banda alvo (a definir por tipo de sessao).
3. Resultado final: `planned_done`, `planned_partially_done` ou `planned_not_done`.

## 7) Mapeamento de dados -> uso funcional

1. `duration_minutes`, `distance_km`, `avg_pace`
- Uso: analise de volume e ritmos de corrida.

2. `tss`, `avg_heart_rate`, `avg_power`, `work_kj`
- Uso: carga interna/externa e recalculo de CTL/ATL/TSB.

3. `sport_type`, `session_date`
- Uso: match de adesao ao plano semanal por tipo e dia.

4. `source_payload`
- Uso: auditoria, debug, enriquecimentos futuros sem perda de dado bruto.

## 8) Gaps identificados

1. Falta formalizar a referencia individual minima por atleta para fallback de TSS.
2. `avg_pace` ainda nao esta preenchido no mapper atual.
3. Falta helper dedicado para marcar conclusao de corrida em `athlete_weekly_plan` (analogo ao fluxo de forca).
4. Falta registrar explicitamente o metodo de TSS aplicado por sessao.
5. Falta definir a tabela final de `fator_zona` para hrTSS no backend.

## 9) Plano de implementacao (proximo incremento)

1. Enriquecimento do mapper Strava
- Preencher `avg_pace`.
- Preservar moving vs elapsed no payload enriquecido.
- Garantir comportamento igual em sync manual e webhook.

2. Adesao ao plano de corrida
- Criar helper backend para match conservador no mesmo dia/tipo.
- Marcar `completed` apenas em match inequivoco.
- Guardar metadados de match em `running_session_data`.

3. TSS fallback (apos aprovacao)
- Implementar hierarquia `power -> run_pace -> swim_speed -> heart_rate -> null`.
- Exigir validacao de metricas individuais antes de calcular fallback.
- Adicionar observabilidade por metodo de TSS.

4. Validacao
- Cenarios: atividade nova, update, delete, duplicada, sem TSS nativo, dia com sessoes ambiguas.
- Verificar impacto em `training_load_daily`, `training_load_metrics` e estado do plano semanal.

## 10) Decisoes pendentes para fechar logica final

1. Quais campos individuais vamos exigir por metodo:
- Potencia: FTP?
- Pace: threshold pace explicito ou derivado por VDOT?
- FC: LTHR + zonas obrigatorias?
- Natacao: threshold speed (m/min) obrigatoria?

2. Bandas de aderencia por tipo de sessao (duracao e TSS):
- `easy`, `tempo`, `interval`, `long`, etc.

3. Politica para dias com multiplas sessoes:
- Auto-match apenas quando inequivoco (recomendado)
- Ou modo de sugestao com confirmacao manual

## 11) Criterio de aceite desta fase

1. Documento aprovado para estrategia de TSS e adesao.
2. Mapper Strava enriquecido com pace e metadados necessarios.
3. Match conservador de corrida ativo e sem falsos positivos obvios.
4. CTL/ATL/TSB sem regressao matematica, apenas com melhor qualidade de entrada.
5. Logs de sync com rastreabilidade minima por atleta, evento e metodo de carga usado.
