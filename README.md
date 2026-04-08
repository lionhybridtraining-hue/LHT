# 🦁 LHT — Lion Hybrid Training

Plataforma de coaching autónomo: captação de treino → análise inteligente → ajuste adaptativo.

**Estado atual**: Phase 1 MVP — ~68% completo (Abril 2026)

---

## 🏗️ Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend (Atleta)** | React + TypeScript (Vite) |
| **Frontend (Coach)** | Vanilla HTML/CSS/JS |
| **Frontend (Plano Corrida)** | React + TypeScript (Vite) |
| **Backend** | Node.js — Netlify Functions |
| **Base de Dados** | Supabase (PostgreSQL + Auth + Storage) |
| **Autenticação** | Google OAuth + Supabase JWT |
| **Pagamentos** | Stripe |
| **APIs Externas** | Strava, Google, Meta |
| **Hosting** | Netlify |

---

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- Conta Supabase (URL + keys)
- Netlify CLI (`npm install -g netlify-cli`)

### Setup

```bash
# Clonar e instalar
git clone <repo-url>
cd LHT
npm install

# Instalar dependências do frontend React
cd aer-frontend-main && npm install && cd ..

# Configurar environment
# Copiar .env.example para .env e preencher:
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
#   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET

# Correr em desenvolvimento (offline, sem Netlify cloud)
npm run dev:offline
```

O site fica disponível em `http://localhost:8888`.

### Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev:offline` | Dev server local (Netlify offline mode) |
| `npm run dev` | Dev server com Netlify cloud features |
| `npm run build` | Build de produção (blog JSON + planocorrida Vite) |
| `npm run dev:planocorrida` | Dev isolado do frontend React (porta 5173) |

---

## 📂 Estrutura do Projeto

```
LHT/
├── aer-frontend-main/          # App React do atleta (Vite + TypeScript)
│   ├── src/
│   │   ├── pages/atleta/       # Páginas: força, calendário, programas, perfil
│   │   ├── services/           # API calls: strava.ts, strength.ts, auth.ts
│   │   └── components/         # Componentes partilhados
│   └── package.json
│
├── coach/                      # Dashboard do coach (vanilla JS)
│   └── index.html              # SPA — todas as features num ficheiro
│
├── strength/                   # App de treino de força (PWA offline-first)
│   └── index.html
│
├── check-in/                   # Sistema de check-in do atleta
│
├── netlify/functions/          # Backend serverless (80+ funções)
│   ├── _lib/                   # Helpers partilhados: auth, supabase, strava
│   ├── strength-plan.js        # Gestão de templates de força
│   ├── strava-sync.js          # Ingestão de dados Strava
│   ├── program-*.js            # Gestão de calendário/programa
│   └── ...
│
├── scripts/                    # Migrações DB + scripts de build
│   ├── supabase-schema.sql     # Schema canónico da DB
│   ├── migration-*.sql         # Migrações incrementais (50+)
│   ├── build-planocorrida.mjs  # Build do React app (Vite)
│   └── generate-posts-json.mjs # Gera JSON estático do blog
│
├── assets/                     # Imagens, ícones, vídeos (públicos)
├── blog/                       # Conteúdo do blog (gerado)
├── admin/                      # Painel admin (blog CMS via Supabase)
│
├── *.html                      # Páginas estáticas do site público
│   ├── index.html              # Homepage
│   ├── programas.html          # Catálogo de programas
│   ├── blog.html               # Listagem do blog
│   ├── sobre.html              # Sobre nós
│   └── ...
│
├── netlify.toml                # Configuração de deploy e redirects
└── package.json                # Scripts de build e dependências
```

---

## 📚 Documentação

### Arquitetura & Planeamento
| Documento | Descrição |
|-----------|-----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitetura do sistema, data model, APIs |
| [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) | Visão do produto e roadmap 4 fases |
| [PHASES-OVERVIEW.md](PHASES-OVERVIEW.md) | Resumo visual de cada fase |
| [PHASE-1-TASKS.md](PHASE-1-TASKS.md) | Tasks detalhadas da sprint atual |
| [PROJECT-START.md](PROJECT-START.md) | Guia de onboarding para novos devs |

### Features
| Documento | Descrição |
|-----------|-----------|
| [README-STRIPE-WEBHOOK.md](README-STRIPE-WEBHOOK.md) | Fluxo de checkout e pagamentos Stripe |
| [README-STRAVA-DADOS-E-TSS.md](README-STRAVA-DADOS-E-TSS.md) | Integração Strava e cálculo TSS |
| [README-COACH-UPLOAD-FLOW.md](README-COACH-UPLOAD-FLOW.md) | Pipeline de upload CSV do coach |
| [README-PROGRAM-CLASSIFICATION.md](README-PROGRAM-CLASSIFICATION.md) | Taxonomia de classificação de programas |
| [README-ADMIN-FUNIL-E-RETENCAO.md](README-ADMIN-FUNIL-E-RETENCAO.md) | Dashboard admin: funil e retenção |

### Operações & Segurança
| Documento | Descrição |
|-----------|-----------|
| [README-DEPLOY.md](README-DEPLOY.md) | Guia de deploy no Netlify |
| [README-SECURITY-IMPLEMENTATION-STATUS.md](README-SECURITY-IMPLEMENTATION-STATUS.md) | Status de hardening de segurança |
| [README-ANALYTICS.md](README-ANALYTICS.md) | Definições custom GA4 |
| [README-POSTS.md](README-POSTS.md) | Pipeline de gestão do blog |
| [CONSENT-MECHANISM.md](CONSENT-MECHANISM.md) | Sistema de consentimento GDPR |
| [TESTE-AUTENTICACAO.md](TESTE-AUTENTICACAO.md) | Testes de autenticação do coach |

---

## 📊 Estado Atual (Abril 2026)

| Área | Status | Conclusão |
|------|--------|-----------|
| Strength Backend | ✅ Completo | 100% |
| Strength Athlete UI | ✅ Completo | 100% |
| Strength Coach UI | ⚠️ Parcial | 60% |
| Training Zones Backend | ✅ Completo (family/method MVP) | 85% |
| Training Zones Coach UI | ✅ Completo (editor) | 100% |
| Training Zones Athlete UI | ❌ Não iniciado | 0% |
| Strava OAuth | ✅ Implementado | 100% |
| Strava Sync | ✅ Activity ingest | 80% |
| Strava TSS | ⚠️ Fórmulas apenas | 20% |
| Calendar/Programa | ✅ Preset-driven | 90% |
| Blog | ✅ Completo | 100% |
| Athlete Profile | ✅ Completo | 100% |
| Coach Dashboard | ⚠️ Parcial | 40% |
| Analytics | ⚠️ Eventos enviados | 30% |

### Fases do Produto
1. **Phase 1** (2-3 sem) — MVP: strength + calendar + basic Strava ← **atual**
2. **Phase 2** (4-6 sem) — Data-driven: TSS + CTL/ATL + coach dashboard
3. **Phase 3** (6-8 sem) — Intelligence: adaptive scheduling + VDOT auto-fill
4. **Phase 4** (12-18 meses) — Autonomous: wearables + predictive AI + scale

→ Ver [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) para detalhes completos.

---

## 🔐 Autenticação

- **Atletas**: Google OAuth via Supabase JWT
- **Coach**: Google OAuth via Supabase JWT
- **Admin**: Google OAuth (Supabase dashboard)
- **Sessões**: max-age 24h, JWT signature verification via JWKS
- **RLS**: Ativo em tabelas de strength; pending em programs/assignments

---

## 💳 Pagamentos

- Stripe Checkout para compra de programas
- Webhook (`meta-webhook.js`) processa `checkout.session.completed`
- Modelo: `stripe_purchases` (status + expires_at) → `program_assignments` (criado manualmente pelo coach)

→ Ver [README-STRIPE-WEBHOOK.md](README-STRIPE-WEBHOOK.md)

---

## 🏃 Strava

- OAuth connection (`strava-connect.js`)
- Manual sync por atleta (`strava-sync.js`)
- Dados ingeridos para `athlete_training_sessions`
- TSS calculation: Phase 2

→ Ver [README-STRAVA-DADOS-E-TSS.md](README-STRAVA-DADOS-E-TSS.md)

---

## 📝 Deploy

```bash
# O build é feito automaticamente pelo Netlify:
# 1. generate-posts-json.mjs → blog/posts.json
# 2. build-planocorrida.mjs → planocorrida/ (Vite build)
# 3. Netlify Functions são bundled automaticamente
```

→ Ver [README-DEPLOY.md](README-DEPLOY.md) para guia completo.
