# Multi-Variant Training Program Architecture

## Visão Geral

O sistema de variantes permite que cada programa de treino ofereça múltiplas combinações de **duração × nível de experiência × frequência semanal**, cada uma com planos de força e/ou corrida explicitamente vinculados.

**Exemplo:** O programa "Maratona Lisboa 2026" pode oferecer 18 variantes:
- 3 durações (8S, 12S, 16S) × 3 níveis (Iniciante, Intermédio, Avançado) × 2 frequências (4×, 5×)

O atleta escolhe a variante no calendário. O sistema gera o plano semanal com os bindings corretos.

---

## O Que Foi Implementado

### 1. Schema da Base de Dados (`migration-program-variants-final.sql`)

| Objeto | Descrição |
|---|---|
| `program_variants` | Tabela principal — cada row é uma variante com metadata + plan bindings |
| `program_assignments.selected_variant_id` | FK para a variante escolhida pelo atleta |
| `training_programs.default_variant_id` | FK para a variante default do programa |
| `athlete_weekly_plan.generated_from_variant_id` | FK para rastreabilidade (que variante gerou cada semana) |
| 4 RLS policies | SELECT para authenticated, INSERT/UPDATE/DELETE para coaches |
| 7 indexes | Partial indexes em FKs + composite index para discovery |
| 2 server functions | `get_variants_for_program()`, `filter_variants()` |

**Campos da tabela `program_variants`:**

| Campo | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | uuid PK | não | Auto-gerado |
| `training_program_id` | uuid FK | não | Programa pai |
| `duration_weeks` | integer | não | Duração em semanas (≥ 1) |
| `experience_level` | text | não | `beginner` · `intermediate` · `advanced` |
| `weekly_frequency` | integer | não | 1–7 |
| `strength_plan_id` | uuid FK | **sim** | Plano de força (nullable — programa só-corrida) |
| `running_plan_template_id` | uuid FK | **sim** | Template de corrida (nullable — programa só-força) |
| `running_config_preset` | jsonb | sim | Config de corrida paramétrica |
| `created_by` | uuid FK | sim | Coach que criou |

**Constraint:** pelo menos um de `strength_plan_id` ou `running_plan_template_id` deve estar preenchido.

### 2. Endpoint Admin (`admin-program-variants.js`)

| Método | Auth | Descrição |
|---|---|---|
| `GET ?program_id=X` | Qualquer user autenticado | Lista variantes (com filtros opcionais) |
| `POST` | Admin | Criar variante única ou batch (até 50) |
| `PATCH ?id=X` | Admin | Atualizar variante |
| `DELETE ?id=X` | Admin | Apagar variante |
| `PUT` | Admin | Definir variante como default do programa |

### 3. Funções DB Helper (`_lib/supabase.js`)

10 funções exportadas:
- `getVariantsForProgram`, `filterVariants`, `getVariantById`
- `createVariant`, `createVariantsBatch`, `updateVariant`, `deleteVariant`
- `setDefaultVariant`
- `deleteAthleteWeeklyPlanFromWeek`, `setAssignmentVariant`

### 4. Geração do Plano Semanal (`athlete-weekly-plan.js`)

- POST aceita `variant_id` opcionalmente (junto com `preset_id`)
- Variante override: `strength_plan_id` e `running_plan_template_id` substituem os do slot do preset
- Running config: resolvida a partir de `variant.running_config_preset` (prioridade: variante → body params)
- Rastreabilidade: cada row em `athlete_weekly_plan` guarda `generated_from_variant_id`

### 5. UI Coach — Gestão de Variantes (`coach/index.html`)

Nova secção no tab **Planeamento** com:
- Selector de programa
- Tabela de variantes existentes (duração, nível, frequência, planos, config, default)
- Botão **+ Nova Variante** → modal de criação/edição
- Botão **Gerar Batch** → modal de criação em massa (produto cartesiano)
- Editar e apagar variantes inline
- Definir variante como default (estrela ★)

### 6. UI Atleta — Variant Picker (`VariantPicker.tsx`)

- Componente React com filtros interativos (duração, nível, frequência)
- Cards com metadata: "8S · Intermédio · 4×/sem" + badges de planos
- Integrado no `calendario.tsx` — aparece quando há variantes e o atleta ainda não tem plano

### 7. Service Layer Frontend (`variant-service.ts`)

- `fetchVariantsForProgram(programId, filters?)` — GET
- `selectVariantForAssignment(assignmentId, variantId, presetId)` — POST
- `extractVariantFilterOptions(variants)` — derivar opções únicas de filtro

---

## Alterações Feitas Nesta Sessão

| Ficheiro | Alteração |
|---|---|
| `admin-program-variants.js` | **GET**: auth mudou de `requireRole("admin")` → `requireAuthenticatedUser` (atletas precisam ler variantes) |
| `admin-program-variants.js` | **Validação**: `strength_plan_id` e `running_plan_template_id` agora opcionais (pelo menos 1 obrigatório) |
| `admin-program-variants.js` | **PATCH**: permite enviar `null` para limpar plan IDs (`"in" body` check) |
| `athlete-my-programs.ts` | Adicionado `selectedVariantId?: string \| null` ao tipo `MyProgram` |
| `coach/index.html` | Nova secção "Variantes do Programa" no tab Planeamento (HTML + JS CRUD completo) |
| `migration-program-variants-final.sql` | SQL final consolidado: `weekly_frequency` 1–7, plan IDs nullable, RLS, idempotência |

---

## Guia Step-by-Step: Coach/Admin

### Pré-requisito

Executar a migration SQL no Supabase Studio:
1. Abrir Supabase Studio → SQL Editor
2. Colar o conteúdo de `scripts/migration-program-variants-final.sql`
3. Executar (RUN)
4. Validar com as queries de verificação incluídas no final do ficheiro

### Passo 1 — Aceder ao painel Coach

1. Ir a `/coach/`
2. Fazer login com conta de coach/admin
3. Clicar no tab **Planeamento**

### Passo 2 — Selecionar programa

1. Na secção **Variantes do Programa**, usar o dropdown "Programa"
2. Selecionar o programa para o qual se quer criar variantes
3. A tabela de variantes carrega (vazia se ainda não existirem)

### Passo 3A — Criar variante individual

1. Clicar **+ Nova Variante**
2. Preencher o formulário:
   - **Duração (semanas):** número de semanas do plano (ex: 8)
   - **Nível:** Iniciante / Intermédio / Avançado
   - **Frequência semanal:** 1× a 7× por semana
   - **Plano de Força:** selecionar um plano existente (ou "Nenhum" se corrida-only)
   - **Template de Corrida:** selecionar um template existente (ou "Nenhum" se força-only)
   - **Config corrida (opcional):** expandir para definir volume inicial, progressão semanal, tipo de periodização
3. Clicar **Criar**
4. A variante aparece na tabela

### Passo 3B — Gerar variantes em batch

1. Clicar **Gerar Batch**
2. Selecionar as checkboxes:
   - **Durações:** ex: 4S, 8S, 12S
   - **Níveis:** ex: Iniciante, Intermédio, Avançado
   - **Frequências:** ex: 3×, 4×, 5×
3. Selecionar o **plano de força** e/ou **template de corrida** (aplicado a todas as variantes)
4. O preview mostra: "3 durações × 3 níveis × 3 frequências = 27 variantes"
5. Clicar **Gerar Variantes**
6. Todas as combinações são criadas de uma vez (máximo 50 por batch)

### Passo 4 — Editar variante

1. Na tabela, clicar **Editar** na variante desejada
2. Modificar campos no modal
3. Clicar **Guardar**

### Passo 5 — Definir variante default

1. Na coluna "Default", clicar na estrela ☆ da variante desejada
2. A estrela fica dourada ★ — esta é a variante sugerida ao atleta por defeito

### Passo 6 — Apagar variante

1. Na tabela, clicar **Apagar** na variante
2. Confirmar no diálogo
3. **Atenção:** atletas que já usam esta variante perdem a referência (a FK usa `ON DELETE SET NULL`)

---

## Fluxo do Atleta (automático)

1. Atleta acede ao **Calendário** (`/atleta/calendario`)
2. Se o programa tem variantes criadas, o **Variant Picker** aparece automaticamente
3. O atleta filtra por duração, nível e frequência
4. Seleciona a variante desejada
5. O sistema gera o plano semanal com os planos de força e corrida da variante
6. A variante fica associada ao assignment do atleta (`selected_variant_id`)

---

## Arquitetura de Ficheiros

```
scripts/
  migration-program-variants-final.sql    ← SQL para executar no Supabase

netlify/functions/
  admin-program-variants.js               ← CRUD endpoint
  athlete-weekly-plan.js                  ← Geração de plano (aceita variant_id)
  _lib/supabase.js                        ← 10 helper functions

coach/
  index.html                              ← Tab "Planeamento" > secção "Variantes do Programa"

aer-frontend-main/src/
  services/variant-service.ts             ← API client + types
  services/athlete-my-programs.ts         ← MyProgram type com selectedVariantId
  services/athlete-schedule.ts            ← WeeklyPlanRow com generated_from_variant_id
  components/atleta/VariantPicker.tsx      ← UI de seleção (filtros + cards)
  pages/atleta/calendario.tsx             ← Integração do picker no calendário
```

---

## Notas Técnicas

- **RLS:** `program_variants` tem RLS ativo. O service_role key (usado pelas Netlify Functions) bypassa RLS. Policies existem para acesso direto via Supabase client.
- **Idempotência:** A migration SQL usa `IF NOT EXISTS` em todo o lado — seguro re-executar.
- **Constraint unique:** `(training_program_id, duration_weeks, experience_level, weekly_frequency)` — impede duplicados.
- **Plan bindings nullable:** Pelo menos um de `strength_plan_id` ou `running_plan_template_id` é obrigatório (CHECK constraint na DB + validação no backend).
