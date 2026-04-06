# 🚀 LHT: Lion Hybrid Training — Project Overview

Welcome to the LHT codebase. This document helps you get oriented and find what you need.

---

## 📚 Quick Navigation

### **🎯 First Time Here?**
Start here, in order:
1. [**PRODUCT-ROADMAP.md**](PRODUCT-ROADMAP.md) — Understand the vision and phases
2. [**PHASES-OVERVIEW.md**](PHASES-OVERVIEW.md) — Quick visual summary of each phase
3. [**PHASE-1-TASKS.md**](PHASE-1-TASKS.md) — Current sprint tasks (what we're building now)
4. [**ARCHITECTURE.md**](ARCHITECTURE.md) — System structure, APIs, data model

### **👨‍💻 For Developers**
- **Picking a task?** → See [PHASE-1-TASKS.md](PHASE-1-TASKS.md) for sprint tasks
- **Need system context?** → See [ARCHITECTURE.md](ARCHITECTURE.md) for data model + APIs
- **Understanding a feature?** → Look for feature name in ARCHITECTURE.md table
- **Finding code?** → See "Where to Find Things" section in ARCHITECTURE.md

### **🏃 For Coaches**
- **Getting started?** → See [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md#-vision--strategic-goals) for What's coming
- **Tracking athletes?** → Phase 1 has basic athlete list; Phase 2 adds detailed dashboard

### **📊 For Product/Leadership**
- **High-level plan?** → [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) (vision + phases 1-4)
- **Timeline?** → [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md#-timeline-summary) and [PHASES-OVERVIEW.md](PHASES-OVERVIEW.md)
- **Current status?** → [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md#-current-state-summary-as-of-april-5-2026) table
- **Blocking issues?** → See PHASE-1-TASKS.md "Blockers & Escalation"

---

## 🎯 What Is LHT?

**Lion Hybrid Training**: A platform for coaches to manage athletes' strength + endurance training.

### **Current State (April 2026)**
- ✅ **68% feature-complete**
- ✅ Strength training app (athlete + coach)
- ✅ Calendar/programas (preset-driven)
- ✅ Strava integration (OAuth + manual sync)
- ✅ Training zones (coach editor, athlete UI coming)
- ⏳ Training load metrics (Phase 2)
- ⏳ Adaptive scheduling (Phase 3)

### **Long-term Goal**
Autonomous coaching loop: Athletes train → System captures data → Coach reviews → Auto-adjust → Repeat.

### **4 Phases to Get There**
1. **Phase 1 (2-3w)**: MVP launch — strength + calendar + basic Strava
2. **Phase 2 (4-6w)**: Data-driven — training load metrics + coach dashboard
3. **Phase 3 (6-8w)**: Intelligence — adaptive scheduling + smart zone auto-fill
4. **Phase 4 (12-18m)**: Autonomous — wearables + predictive AI + scale

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend (Athlete)** | React + TypeScript (Vite build) |
| **Frontend (Coach)** | Vanilla HTML/CSS/JS (no build needed) |
| **Frontend (Mobile)** | React app + PWA manifest (offline support) |
| **Backend** | Node.js Netlify Functions |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Google OAuth + Supabase JWT |
| **Payments** | Stripe |
| **External APIs** | Strava, Google, Meta (Stripe webhook) |
| **Hosting** | Netlify (frontend + functions) |

---

## 📂 Project Structure

```
LHT/
├── aer-frontend-main/              # React app (athlete-facing)
│   ├── src/
│   │   ├── pages/atleta/           # Pages: forca, calendario, programas, perfil, etc.
│   │   ├── services/               # API calls: strava.ts, strength.ts, auth.ts
│   │   └── components/             # Shared UI components
│   └── package.json
│
├── coach/                          # Coach dashboard (vanilla JS)
│   ├── index.html                  # Single-page app (all features in one HTML file)
│   └── index.css
│
├── strength/                       # Standalone strength training app
│   ├── index.html                  # Offline-first PWA
│   └── index.css
│
├── netlify/functions/              # Serverless backend
│   ├── strength-plan.js            # Template creation/management
│   ├── athlete-strength-plan.js    # Athlete workout retrieval
│   ├── strava-sync.js              # Strava data ingestion + TSS calc
│   ├── strava-connect.js           # OAuth flow
│   ├── coach-athlete-training-zones.js  # Zone management
│   ├── program-*.js                # Calendar/programa management
│   ├── _lib/                       # Shared: auth, supabase, strava, training-load
│   └── ...
│
├── scripts/                        # Database migrations + build scripts
│   ├── supabase-schema.sql         # Canonical DB schema
│   ├── migration-*.sql             # Incremental migrations
│   ├── build-planocorrida.mjs      # Build React app (Vite)
│   └── generate-posts-json.mjs     # Generate blog sitemap
│
├── assets/                         # Images, icons, videos (public)
│   ├── img/
│   ├── icons/
│   └── video/
│
├── blog/                           # Blog content (generated)
│   ├── posts.json                  # Auto-generated sitemap
│   └── index.html
│
├── admin/                          # Admin panel (blog CMS)
│   └── index.html
│
├── netlify.toml                    # Netlify config
├── package.json                    # Root dependencies
├── jsconfig.json
│
└── DOCUMENTATION
    ├── PRODUCT-ROADMAP.md          # ← YOU ARE HERE (strategic doc)
    ├── PHASE-1-TASKS.md            # Current sprint
    ├── PHASES-OVERVIEW.md          # Visual phase summary
    ├── ARCHITECTURE.md             # Data model + APIs
    ├── README-*.md                 # Feature-specific docs
    └── PROJECT-START.md            # This file
```

---

## 🚀 Getting Started (Local Development)

### **Prerequisites**
- Node.js 18+
- PostgreSQL (or Supabase account for remote DB)
- Git
- Netlify CLI (for local function testing)

### **Setup**
```bash
# 1. Clone repo
git clone <repo-url>
cd LHT

# 2. Install dependencies
npm install
cd aer-frontend-main
npm install
cd ..

# 3. Create .env (ask team for values)
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, STRAVA_CLIENT_ID, STRIPE_SECRET_KEY, etc.

# 4. Run dev server
npm run dev:offline  # Netlify + React in parallel

# 5. Open browser
# - Athlete app: http://localhost:3000 (React)
# - Coach dashboard: http://localhost:8888/coach/
# - Strength app: http://localhost:8888/strength/
# - API docs: http://localhost:8888/.netlify/functions/health-check
```

### **Build & Deploy**
```bash
# Build React app (Vite)
npm run build

# Test build locally
npm run dev:offline

# Deploy to Netlify (auto on git push to main)
git push origin main
```

---

## 📖 How to Read the Docs

**Different roles, different docs**:

### **Product Owner / Coach**
1. [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) — strategy + timeline
2. [PHASES-OVERVIEW.md](PHASES-OVERVIEW.md) — quick visual
3. [README-STRAVA-DADOS-E-TSS.md](README-STRAVA-DADOS-E-TSS.md) — TSS formulas (if interested)

### **Developer (New Feature)**
1. [PHASE-1-TASKS.md](PHASE-1-TASKS.md) → pick a task
2. [ARCHITECTURE.md](ARCHITECTURE.md#-how-to-find-things) → find relevant files
3. Code + existing similar feature to understand pattern
4. Reference [ARCHITECTURE.md#-core-apis--endpoints) for API contract

### **Developer (Bug Fix)**
1. Locate issue in code
2. Reference [ARCHITECTURE.md](ARCHITECTURE.md) to understand data flow
3. Check [README-SECURITY-IMPLEMENTATION-STATUS.md](README-SECURITY-IMPLEMENTATION-STATUS.md) if auth-related
4. Test locally with `npm run dev:offline`

### **DevOps / Deployment**
1. [README-DEPLOY.md](README-DEPLOY.md) — deployment process
2. [netlify.toml](netlify.toml) — Netlify config
3. [scripts/supabase-schema.sql](scripts/supabase-schema.sql) — DB schema

---

## 📋 Key Concepts

### **1. Strength Planning**
- **Plan**: Reusable template (e.g., "12-week Base Block")
- **Instance**: Plan assigned to athlete (e.g., "João — Base Block, Apr 1-Jun 15")
- **Exercise**: Atomic unit (e.g., "Squat")
- **Prescription**: Weekly metadata (e.g., "Week 4: 4×4 @ 7-8 RPE, 2 min rest")
- **Log**: Athlete execution (e.g., "I did 4 reps @ 85 kg, 1 RIR")

### **2. Training Zones**
- **Profile**: Coach-defined zones for an athlete × modality
  - Heart Rate family: family=heart_rate, method=fcmax|hrr|lthr
  - Performance (running) family: family=performance, method=run_vdot|run_lt_pace
- **Zones (5)**: Individual Z1-Z5 with min/max thresholds
- Mapped to **common names**: Recovery, Easy, Endurance, Tempo, Threshold, VO2, Sprint

### **3. Strava Integration**
- **OAuth**: Athlete authorizes LHT to read their activities
- **Sync**: Fetch activities from Strava API → save to `athlete_training_sessions`
- **TSS**: Training Stress Score calculated per activity (Phase 2+)
- **CTL/ATL/TSB**: Daily aggregated load (Phase 2+)

### **4. Calendar/Programas**
- **Program**: Reusable training plan (e.g., "Base Building 12 weeks")
- **Preset**: Weekly template (e.g., "Preset A: Mon strength, Tue easy run, Wed threshold run")
- **Assignment**: Coach assigns program to athlete → athlete picks preset each week
- **Session**: Individual workout in preset (e.g., "Threshold run 10 km")

### **5. Athlete Onboarding**
- Survey: sport, goal, current level, etc.
- Feeds into: training zone defaults, program recommendations, Strava scoping
- Captured in `athlete_profiles` (not yet UI in athlete app)

---

## ✅ Workflow Examples

### **Scenario 1: Coach Creates Strength Plan**
1. Coach logs in → "New Strength Plan" button
2. Enter: name, total weeks, exercises per day
3. Set prescriptions: week-by-week sets/reps/rest/RIR
4. Save (template)
5. Assign to athlete (creates instance)
6. Athlete sees calendar → starts logging workouts

### **Scenario 2: Coach Enables Strava Sync**
1. Coach logs in → Coach dashboard
2. Clicks "Sync Strava" for athlete João
3. System fetches recent Strava activities
4. Converts to `training_sessions` + calculates TSS (Phase 2+)
5. Updates athlete's CTL/ATL (Phase 2+)
6. Athlete sees activities on dashboard

### **Scenario 3: Coach Defines Training Zones**
1. Coach opens athlete detail → "Training Zones" tab
2. Selects Family (Heart Rate or Performance)
3. Selects Method (fcmax, hrr, lthr, run_vdot, run_lt_pace)
4. Enters parameters (HR max, VDOT, etc.)
5. Clicks "Auto-fill zones" → system generates Z1-Z5
6. Coach reviews + saves
7. Athlete can view zones on app (Phase 2+)

---

## 🆘 Common Tasks

### **How do I...?**

**...find a bug?**
1. Check `get_errors` in console
2. Search codebase: `grep -r "error_name" netlify/functions/`
3. Check logs: Netlify deploy page or error monitoring (if set up)

**...add a new feature?**
1. Check PHASE-1-TASKS.md to see if it's in scope
2. Understand data model in ARCHITECTURE.md
3. Implement in 3 layers: DB (migrations) → API (functions) → UI (React/HTML)
4. Test locally with `npm run dev:offline`

**...update the roadmap?**
1. Edit PRODUCT-ROADMAP.md or PHASE-1-TASKS.md
2. Keep aligned with actual progress
3. Post in team sync if scope changed significantly

**...investigate a performance issue?**
1. Check Netlify function logs (execution time, memory)
2. Profile React app: DevTools → Performance tab
3. Measure API response time: Network tab in browser DevTools
4. Check database query plan: `EXPLAIN ANALYZE` in Supabase

**...deploy a change?**
1. Make changes locally
2. Test: `npm run dev:offline`
3. Commit: `git add . && git commit -m "feature: ..."`
4. Push: `git push origin main`
5. Netlify auto-deploys on `main` branch

---

## 📞 Getting Help

| Question | Answer |
|----------|--------|
| How does X feature work? | See ARCHITECTURE.md feature table |
| What's the plan for Y? | See PRODUCT-ROADMAP.md phases |
| How do I run the code? | See "Getting Started (Local Development)" above |
| Where is Z code? | See ARCHITECTURE.md "Where to Find Things" |
| What's the current status? | See PRODUCT-ROADMAP.md "Current State Summary" |
| I'm blocked on task X | See PHASE-1-TASKS.md "Blockers & Escalation" |

---

## 🎓 Recommended Reading (In Order)

1. **PRODUCT-ROADMAP.md** (30 min read) — Understand why we exist
2. **ARCHITECTURE.md** (45 min read) — Understand how we're built
3. **PHASE-1-TASKS.md** (15 min read) — Understand what we're doing today
4. Pick a task → Implement → Ship

---

## 📊 Key Metrics We Track

- **Phase 1 Success**: DAU > 10, API p95 < 500ms, Strava sync > 95% success rate
- **Phase 2 Success**: 50% of sessions have TSS calculated, coach DAU > 70%
- **Phase 3 Success**: Athlete compliance > 70%, adaptive suggestions adopted > 50%
- **Phase 4 Success**: System runs autonomously, scale to 100+ coaches

---

## 🔄 How to Update This Document

Found outdated info? Update PRODUCT-START.md or the relevant doc above. Keep this as the **single source of truth** for project orientation.

```bash
# Make change
vim PRODUCT-START.md

# Commit
git add PRODUCT-START.md
git commit -m "docs: update project overview"
git push origin main
```

---

## 📜 License & Credits

[Add your license here]

**Team**: [Add team members]  
**Last Updated**: April 5, 2026  
**Next Review**: April 12, 2026 (end of Phase 1 week 1)

---

**Ready to build? Pick a task from PHASE-1-TASKS.md and get started!** 🚀
