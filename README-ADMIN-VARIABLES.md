# Variáveis do Painel Admin — Onde são armazenadas

> Este documento responde à questão: **onde estão armazenadas as variáveis que consigo alterar em `/admin`?**

---

## Resumo rápido

Todas as variáveis editáveis no painel `/admin` estão guardadas em **tabelas do Supabase** (PostgreSQL).
O fluxo é sempre o mesmo:

```
/admin (edita) → Supabase (armazena) → /.netlify/functions/site-content (serve) → páginas públicas (consomem)
```

A função serverless de escrita é `admin-site-content` (requer role `admin`).  
A função pública de leitura é `site-content` (sem autenticação).

---

## Tabelas e variáveis

### 1. `site_metadata` — Textos e datas

Chave/valor de texto livre. Usada para títulos, datas, descrições e SEO.

| Chave | Onde aparece no site | Exemplo |
|---|---|---|
| `aer_next_date` | Homepage | `16 de Fevereiro` |
| `challenge_name` | Calendário | `Trail do Gerês 2026` |
| `challenge_date_label` | Calendário | `Junho 2026` |
| `challenge_location` | Calendário | `Serra da Estrela, Portugal` |
| `challenge_format` | Calendário | `Corrida, trail ou desafio híbrido` |
| `challenge_focus` | Calendário | `Base aeróbica, resiliência e progressão` |
| `challenge_description` | Calendário | Descrição do cartão do desafio |
| `calendar_title` | `<title>` da página Calendário | SEO |
| `calendar_description` | `<meta description>` Calendário | SEO |
| `calendar_canonical_url` | `<link rel="canonical">` Calendário | SEO |
| `calendar_og_*` | Open Graph do Calendário | SEO social |
| `calendar_twitter_*` | Twitter Card do Calendário | SEO social |
| `calendar_page_name` | Nome interno da página | — |
| `calendar_page_url` | URL canónica interna | — |
| `calendar_page_description` | Descrição interna da página | — |
| `calendar_embed_url` | iframe do Google Calendar | Calendário |

> Podes adicionar chaves personalizadas através do botão **"+ Adicionar"** ou dos **presets SEO** no painel admin.

**Localização na base de dados:**
```sql
SELECT key, value FROM site_metadata ORDER BY key;
```

---

### 2. `site_links` — URLs e CTAs

Chave/URL. Usada para links de redes sociais, CTAs e calendários.

| Chave | Descrição | Onde aparece |
|---|---|---|
| `cta_reserva_aer` | Link de reserva AER (Stripe) | Todos os CTAs principais |
| `cta_plano_gratuito` | Link do plano gratuito (Google Form) | CTAs plano gratuito |
| `social_instagram` | URL do Instagram | Rodapé |
| `social_youtube` | URL do YouTube | Rodapé |
| `social_whatsapp` | Link da comunidade WhatsApp | Todos |
| `calendar_google_url` | Adicionar ao Google Calendar | Calendário |
| `calendar_ical_url` | Subscrever via iCal | Calendário |

**Localização na base de dados:**
```sql
SELECT key, url FROM site_links ORDER BY key;
```

---

### 3. `site_metrics` — Estatísticas / números de destaque

Linhas com `value` (número/texto) + `label` (descrição) + `sort_order` + `active`.  
Aparecem como métricas de prova social (ex: "200+ atletas", "92% satisfação").

| Campo | Tipo | Descrição |
|---|---|---|
| `value` | text | O número ou valor a mostrar |
| `label` | text | A etiqueta/descrição da métrica |
| `sort_order` | integer | Ordem de apresentação |
| `active` | boolean | Visível ou oculta |

**Localização na base de dados:**
```sql
SELECT sort_order, value, label, active FROM site_metrics ORDER BY sort_order;
```

---

### 4. `site_reviews` — Testemunhos / avaliações

Linhas com nome, estrelas, texto, meta e data. Aparecem como reviews de clientes.

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | text | Nome do atleta |
| `stars` | integer (1–5) | Classificação |
| `text` | text | Texto do testemunho |
| `meta` | text | Subtítulo (ex: "ATHLETIC ENDURANCE RUNNER") |
| `review_date` | date | Data da avaliação |
| `sort_order` | integer | Ordem de apresentação |
| `active` | boolean | Visível ou oculta |

**Localização na base de dados:**
```sql
SELECT sort_order, name, stars, text, meta, review_date, active FROM site_reviews ORDER BY sort_order;
```

---

### 5. `ai_settings` — Configurações da IA

Chave/valor para o motor de IA (Gemini). Editáveis no separador **IA** do painel admin.

| Chave | Valor por defeito | Descrição |
|---|---|---|
| `tone` | `motivacional` | Tom das respostas da IA |
| `language` | `pt-PT` | Idioma das respostas |
| `persona` | `Coach Linea Iber Training` | Persona/nome da IA |
| `max_kb_chars` | `8000` | Tamanho máximo do contexto (caracteres) |

**Localização na base de dados:**
```sql
SELECT key, value FROM ai_settings ORDER BY key;
```

---

### 6. `ai_prompts` — Prompts de IA

Templates de prompts usados para gerar perguntas e análises do check-in semanal.  
Cada prompt tem `feature`, `type` (`system`/`user`), `content`, `version` e `is_active`.

| Campo | Descrição |
|---|---|
| `feature` | Funcionalidade (ex: `weekly_questions`, `weekly_analysis`) |
| `type` | `system` (instruções base) ou `user` (prompt com dados do atleta) |
| `content` | Texto completo do prompt |
| `version` | Número de versão |
| `is_active` | Apenas um prompt activo por `feature+type` |

O histórico de versões está em `ai_prompt_versions`.

**Localização na base de dados:**
```sql
SELECT feature, type, version, is_active, content FROM ai_prompts ORDER BY feature, type;
```

---

## Ficheiros-chave no código

| Ficheiro | Papel |
|---|---|
| `admin/index.html` | Interface de edição no browser |
| `netlify/functions/admin-site-content.js` | API de leitura/escrita (requer role `admin`) |
| `netlify/functions/site-content.js` | API pública de leitura (sem autenticação) |
| `netlify/functions/admin-ai-prompts.js` | API de gestão de prompts IA |
| `netlify/functions/_lib/supabase.js` | Funções de acesso à base de dados |
| `scripts/supabase-schema.sql` | Definição completa do schema (linhas 242–580) |

---

## Como verificar/editar directamente no Supabase

Se precisares de editar valores directamente (sem passar pelo `/admin`), acede ao **Supabase Dashboard → Table Editor** e selecciona a tabela pretendida:

- `site_metadata` — textos e SEO  
- `site_links` — URLs e CTAs  
- `site_metrics` — estatísticas  
- `site_reviews` — testemunhos  
- `ai_settings` — configuração da IA  
- `ai_prompts` — prompts da IA  
