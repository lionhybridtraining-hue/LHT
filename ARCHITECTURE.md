# System Architecture & Data Model

**Purpose**: Single source of truth for system structure, data model, APIs, and how features connect.  
**Audience**: Dev team, architects, new team members  
**Last Updated**: April 5, 2026

---

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    LHT: Lion Hybrid Training                     │
│                  Athlete + Coach + Autonomous                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐
│   Athlete App        │  │    Coach Dashboard   │  │ Admin Panel  │
│  (React/PWA)         │  │  (Vanilla JS/HTML)   │  │ (Supabase)   │
│                      │  │                      │  │              │
│ - Strength UI        │  │ - Plan templates     │  │ - Blog CMS   │
│ - Calendar/Programa  │  │ - Performance viz    │  │ - User mgmt  │
│ - Check-ins          │  │ - Zone definitions   │  │              │
│ - Profile/Settings   │  │ - Athlete monitoring │  │              │
└──────────────────────┘  └──────────────────────┘  └──────────────┘
        ↓                          ↓                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Netlify Functions (Node.js)                      │
│                                                                   │
│  ├─ Auth: /auth-*, /identity                                    │
│  ├─ Strength: /strength-plan*, /athlete-strength-plan           │
│  ├─ Strava: /strava-*, /training-sessions*                      │
│  ├─ Zones: /coach-athlete-training-zones                        │
│  ├─ Calendar: /program-* /athlete-program                       │
│  ├─ Check-in: /checkin-*                                        │
│  ├─ Meta: /meta-webhook (Stripe), /meta-events                 │
│  └─ Utility: /health-check, /env, /config                       │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + Auth + Storage)              │
│                                                                   │
│  Core Tables:                                                    │
│  ├─ users (JWT identity)                                        │
│  ├─ athletes + athlete_profiles                                 │
│  ├─ strength_plans + strength_plan_exercises + ...              │
│  ├─ athlete_training_zone_profiles + zones                      │
│  ├─ athlete_training_sessions + daily_training_load             │
│  ├─ program_* (calendar/presets)                                │
│  ├─ athlete_strava_connections                                  │
│  └─ ... (30+ tables total)                                      │
│                                                                   │
│  Storage:                                                        │
│  ├─ blog images, video thumbnails                               │
│  └─ CSV uploads (for strength plan imports)                     │
│                                                                   │
│  Auth:                                                           │
│  ├─ Google OAuth (Sign in with Google)                          │
│  ├─ JWT signing + verification                                  │
│  └─ RLS policies (Row-Level Security)                           │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────┐  ┌─────────────────────┐
│   External Services     │  │   Internal Assets   │
│                         │  │                     │
│ - Strava API           │  │ - Blog markdown     │
│ - Stripe (payments)    │  │ - Static HTML       │
│ - Google OAuth         │  │ - SVG icons         │
│ - Meta Webhook         │  │                     │
└─────────────────────────┘  └─────────────────────┘
```

---

## 📋 Core Data Model (Simplified)

### **1. Authentication & Real Identities**

```sql
-- Supabase auth.users (managed by Supabase)
-- id (UUID), email, created_at, ...
-- Multiple logins possible: Google OAuth

-- Custom: athletes table
athletes (
  id UUID PRIMARY KEY,
  identity_id TEXT UNIQUE NOT NULL,      -- Supabase auth.users.sub
  email TEXT NOT NULL,
  name TEXT,
  sport TEXT,                             -- 'running', 'cycling', 'multi'
  profile_image_url TEXT,
  strength_level TEXT,                    -- 'beginner', 'intermediate', 'advanced'
  strength_log_detail TEXT,                -- 'exercise', 'set', 'quick'
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### **2. Strength Training**

```sql
-- Templates (reusable across athletes)
strength_plans (
  id UUID PRIMARY KEY,
  name TEXT,
  total_weeks INT,
  training_program_id UUID REFERENCES training_programs,  -- commercial program
  status TEXT,  -- 'draft', 'active', 'completed', 'archived'
  created_by TEXT
)

-- Exercise catalog (lookup)
exercises (
  id UUID PRIMARY KEY,
  name TEXT,
  category TEXT,  -- 'main_movements', 'core', 'hypertrophy', 'rfd', 'mobility_activation'
  subcategory TEXT,
  video_url TEXT,
  description TEXT,
  default_tempo TEXT,
  default_weight_per_side BOOLEAN,
  default_each_side BOOLEAN
)

-- Exercise slots in plan (per day/section)
strength_plan_exercises (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES strength_plans,
  day_number INT,  -- 1-7
  section TEXT,  -- 'warm_up', 'plyos_speed', 'main', 'conditioning', 'observations'
  exercise_order INT,
  exercise_id UUID REFERENCES exercises,
  alt_progression_exercise_id UUID,      -- alternative if too easy
  alt_regression_exercise_id UUID,       -- alternative if too hard
  plyo_mechanical_load TEXT,  -- 'high', 'medium', 'low'
  rm_percent_increase_per_week NUMERIC,
  each_side BOOLEAN,
  weight_per_side BOOLEAN
)

-- Weekly prescriptions
strength_prescriptions (
  id UUID PRIMARY KEY,
  plan_exercise_id UUID REFERENCES strength_plan_exercises,
  week_number INT,
  prescription_type TEXT,  -- 'reps', 'duration'
  sets INT,
  reps INT,
  reps_min INT,
  reps_max INT,
  duration_seconds INT,
  rest_seconds INT,
  rir INT,  -- reps in reserve
  tempo TEXT,  -- '3-1-1-0'
  gct TEXT,  -- ground contact time: 'altura', 'rápido', 'intermédio'
  method TEXT,  -- 'standard', 'amrap', 'drop_set', 'rest_pause', 'cluster', ...
  rm_percent_override NUMERIC,
  load_override_kg NUMERIC,
  coach_notes TEXT
)

-- Athlete-plan assignment (when coach assigns to athlete)
strength_plan_instances (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES strength_plans,
  athlete_id UUID REFERENCES athletes,
  start_date DATE,
  load_round NUMERIC,  -- default 2.5 kg rounding
  status TEXT,  -- 'active', 'paused', 'completed', 'cancelled'
  plan_snapshot JSONB,  -- full plan state at assignment (for versioning)
  coach_locked_until TIMESTAMPTZ,
  access_model TEXT,  -- 'self_serve', 'coached_one_time', 'coached_recurring'
  stripe_purchase_id UUID,
  program_assignment_id UUID,
  created_at TIMESTAMPTZ
)

-- Athlete execution logs
strength_log_sets (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  plan_id UUID,
  plan_exercise_id UUID REFERENCES strength_plan_exercises,
  week_number INT,
  day_number INT,
  session_date DATE,
  set_number INT,
  reps INT,
  load_kg NUMERIC,
  rir INT,  -- actual RIR (perceived)
  duration_seconds INT,
  method TEXT,
  notes TEXT,
  submitted_by_identity_id TEXT  -- who logged (athlete, coach, app)
)

-- 1RM tracking
athlete_exercise_1rm (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  exercise_id UUID REFERENCES exercises,
  value_kg NUMERIC,
  method TEXT,  -- 'tested', 'estimated_epley', 'manual'
  source TEXT,  -- 'coach_entry', 'auto_from_log'
  tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- Coach notes per phase/section/week
strength_plan_phase_notes (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES strength_plans,
  day_number INT,
  section TEXT,  -- 'warm_up', 'main', etc.
  week_number INT,
  notes TEXT,
  created_at TIMESTAMPTZ
)
```

### **3. Training Zones**

```sql
-- Zone profiles (per athlete, per modality/metric)
athlete_training_zone_profiles (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  modality TEXT UNIQUE WITH (athlete, metric) -- 'general', 'run', 'bike', 'swim', 'row', 'other'
  metric_type TEXT,  -- 'heart_rate', 'pace', 'power'
  model TEXT,  -- 'friel_5', 'jack_daniels', 'percent_hrmax', 'hrr', 'lthr', 'coggan_7'
  -- Thresholds (used for auto-fill + calculations)
  lthr_bpm INT,  -- Lactate Threshold Heart Rate
  hr_max_bpm INT,
  hr_rest_bpm INT,
  threshold_pace_sec_per_km NUMERIC,  -- seconds per km (converted for display)
  vdot NUMERIC,  -- VO2 max estimate (for VDOT model)
  ftp_watts INT,  -- Functional Threshold Power (future: bike)
  -- New schema (Phase 2+):
  family TEXT,  -- 'heart_rate', 'performance'
  method TEXT,  -- 'fcmax', 'hrr', 'lthr', 'run_vdot', 'run_lt_pace'
  scope TEXT,  -- 'general', 'modality'
  lt1_watts_estimate INT,  -- Universal threshold (Phase 2+)
  lt2_watts_estimate INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Individual zones (5 rows per profile, zone 1-5)
athlete_training_zones (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES athlete_training_zone_profiles,
  zone_number INT,  -- 1-5
  min_value NUMERIC,  -- min threshold for zone
  max_value NUMERIC,  -- max threshold for zone
  label TEXT,  -- 'Z1', 'Z2', etc.
  rpe_min INT,  -- Rate of Perceived Exertion: 1-10
  rpe_max INT,
  time_to_failure TEXT,  -- 'all day', '~150 min', '~60 min', '~7 min', '~7 sec'
  lactate_mmol_l NUMERIC,  -- mmol/L for reference
  primary_energy_source TEXT,  -- 'aerobic', 'mixed', 'anaerobic'
  common_terms TEXT,  -- e.g., 'recovery, easy' (for coach display)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### **4. Training Sessions & Load**

```sql
-- All training sessions (from Strava, manual, strength logs, etc.)
athlete_training_sessions (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  source TEXT,  -- 'strava', 'manual', 'strength_log', 'integrated_workout_msg'
  source_id TEXT UNIQUE WITH (source, athlete),  -- 'strava:12345' or 'manual:uuid'
  source_payload JSONB,  -- original Strava/integration data
  
  -- Basic metrics
  activity_date DATE,
  start_time TIMESTAMPTZ,
  duration_seconds INT,
  distance_km NUMERIC,
  activity_type TEXT,  -- 'run', 'ride', 'swim', 'strength', etc.
  sport TEXT,  -- normalized from activity_type
  
  -- Performance data
  avg_heart_rate INT,
  max_heart_rate INT,
  avg_power_watts INT,
  max_power_watts INT,
  total_elevation_gain_m INT,
  
  -- Thresholds & zones (calculated)
  zone_classification TEXT,  -- 'Z1', 'Z2', 'easy', 'threshold', 'VO2', etc.
  tss NUMERIC,  -- Training Stress Score (calculated Phase 2+)
  iftpp NUMERIC,  -- Intensity Factor (power/FTP)
  
  -- Metadata
  title TEXT,
  description TEXT,
  perceived_effort INT,  -- 1-10 RPE (if manual)
  notes TEXT,
  strava_activity_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Daily aggregated training load (Phase 2+)
daily_training_load (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  date DATE UNIQUE WITH (athlete),
  
  -- Daily TSS
  tss_total NUMERIC,  -- sum of TSS for the day
  tss_aerobic NUMERIC,
  tss_threshold NUMERIC,
  tss_vo2 NUMERIC,
  
  -- Banister model
  ctl NUMERIC,  -- Chronic Training Load (42-day average)
  atl NUMERIC,  -- Acute Training Load (7-day average)
  tsb NUMERIC,  -- Training Stress Balance (CTL - ATL)
  
  -- Recovery
  hrv_morning NUMERIC,  -- heart rate variability (if available)
  rhr_morning INT,  -- resting heart rate
  sleep_hours NUMERIC,  -- if available from wearable
  
  created_at TIMESTAMPTZ,
  recalculated_at TIMESTAMPTZ
)

-- Check-in (weekly coach survey)
athlete_check_ins (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  week_start_date DATE,
  submitted_date TIMESTAMPTZ,
  strength_sessions_planned INT,
  strength_sessions_done INT,
  running_sessions_planned INT,
  running_sessions_done INT,
  perceived_fatigue INT,  -- 1-10
  perceived_motivation INT,  -- 1-10
  notes TEXT,
  created_at TIMESTAMPTZ
)
```

### **5. Programs & Calendar**

```sql
-- Commercial programs (reusable products)
training_programs (
  id UUID PRIMARY KEY,
  name TEXT,
  description TEXT,
  duration_weeks INT,
  sport TEXT,  -- 'running', 'cycling', 'strength', 'multi'
  difficulty TEXT,  -- 'beginner', 'intermediate', 'advanced'
  stripe_product_id TEXT,
  billing_type TEXT,  -- 'one_time', 'subscription'
  price_cents INT,
  status TEXT,  -- 'active', 'archived'
  created_at TIMESTAMPTZ
)

-- Athlete program assignment (e.g., "João assigned Base Building - May 2026")
program_assignments (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  program_id UUID REFERENCES training_programs,
  stripe_order_id TEXT,
  status TEXT,  -- 'active', 'completed', 'cancelled'
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ
)

-- Schedule presets (weekly template, e.g., "Base Block: 3 hard + 3 easy")
program_schedule_presets (
  id UUID PRIMARY KEY,
  program_id UUID REFERENCES training_programs,
  week_number INT,
  preset_name TEXT,  -- "Base Week A", "Peak Week", etc.
  description TEXT,
  created_at TIMESTAMPTZ
)

-- Sessions in preset (e.g., "Monday: Strength + Easy Run", "Wednesday: Threshold Run")
program_schedule_sessions (
  id UUID PRIMARY KEY,
  preset_id UUID REFERENCES program_schedule_presets,
  day_of_week INT,  -- 0=Sunday, 1=Monday, ..., 6=Saturday
  session_order INT,
  session_type TEXT,  -- 'strength', 'running', 'cycling', 'rest'
  sport TEXT,
  strength_plan_id UUID REFERENCES strength_plans,  -- if applicable
  description TEXT,  -- "Easy 45 min recovery run"
  target_distance_km NUMERIC,
  target_duration_minutes INT,
  target_zone TEXT,  -- 'Z2 aerobic', 'Z4 threshold', etc.
  created_at TIMESTAMPTZ
)

-- Athlete's selected preset for week
athlete_weekly_schedules (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  assignment_id UUID REFERENCES program_assignments,
  week_number INT,
  preset_id UUID REFERENCES program_schedule_presets,
  selected_at TIMESTAMPTZ,
  can_override BOOLEAN DEFAULT FALSE
)
```

### **6. Strava Integration**

```sql
-- OAuth connection
athlete_strava_connections (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  strava_athlete_id INT UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,  -- 'activity:read_all,activity:read'
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,  -- 'success', 'error', 'data_integrity_issue'
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Sync event log (for audit + troubleshooting)
strava_sync_events (
  id UUID PRIMARY KEY,
  connection_id UUID REFERENCES athlete_strava_connections,
  sync_start_at TIMESTAMPTZ,
  sync_end_at TIMESTAMPTZ,
  activities_fetched INT,
  activities_created INT,
  activities_updated INT,
  activities_deleted INT,
  sessions_upserted INT,
  status TEXT,  -- 'success', 'partial', 'error'
  error_message TEXT,
  created_at TIMESTAMPTZ
)
```

### **7. Payments & Billing**

```sql
-- Orders (Stripe integration)
meta_orders (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  program_id UUID REFERENCES training_programs,
  stripe_order_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  amount_cents INT,
  currency TEXT,
  status TEXT,  -- 'paid', 'pending', 'refunded', 'failed'
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)

-- Subscriptions (recurring)
meta_subscriptions (
  id UUID PRIMARY KEY,
  athlete_id UUID REFERENCES athletes,
  stripe_subscription_id TEXT UNIQUE,
  program_id UUID REFERENCES training_programs,
  status TEXT,  -- 'active', 'paused', 'cancelled'
  current_period_start DATE,
  current_period_end DATE,
  created_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
)
```

### **8. Blog & Content**

```sql
-- Blog articles (Supabase CMS)
blog_articles (
  id UUID PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  content_markdown TEXT,
  cover_image_url TEXT,
  author_name TEXT,
  category TEXT,  -- 'training', 'nutrition', 'recovery', etc.
  status TEXT,  -- 'draft', 'published', 'archived'
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

---

## 🔌 Core APIs & Endpoints

### **Authentication**
```
GET  /auth-status               – Check if user is logged in (JWT)
POST /auth-callback             – OAuth callback (Google, Strava)
POST /logout                    – Clear session
```

### **Athlete Data**
```
GET  /athlete-profile           – Get current athlete + onboarding progress
PUT  /athlete-profile           – Update athlete details + preferences
GET  /athlete-strength-plan     – Get active strength plan + history
POST /strength-log              – Log a set: {exercise_id, reps, load_kg, rir}
GET  /athlete-training-sessions – Get activities (with pagination)
```

### **Strength Plans (Coach)**
```
POST   /strength-plan           – Create new plan
GET    /strength-plan?planId=X  – Get plan + exercises + prescriptions
PUT    /strength-plan           – Upsert exercises/prescriptions
PATCH  /strength-plan           – Update specific sections (bulk)
POST   /strength-plan-instance  – Assign plan to athlete
GET    /strength-plan-instances – List all assigned plans (coach)
DELETE /strength-plan?id=X      – Delete plan (if no instances)
```

### **Training Zones (Coach)**
```
GET    /coach-athlete-training-zones?athleteId=X
       – Get all zone profiles for athlete

PUT    /coach-athlete-training-zones
       – Upsert zone profile + 5 zones:
         {athleteId, modality, metric_type, model, parameters, zones}

DELETE /coach-athlete-training-zones?profileId=X&modality=run
       – Delete a zone profile

POST   /training-zones-auto-fill
       – Auto-calculate zones given VDOT or FTP
```

### **Strava Integration**
```
GET  /strava-status             – Check connection + last sync time
GET  /strava-connect            – Get OAuth URL to authorize
POST /strava-oauth-callback     – Receive code + exchange for token
POST /strava-sync               – Manual full sync + calculate TSS + update CTL/ATL
GET  /strava-webhook            – Receive Strava activity notifications
```

### **Training Load (Future: Phase 2+)**
```
GET  /athlete-training-load?from=DATE&to=DATE
     – Get daily CTL/ATL/TSB trend + chart data

GET  /athlete-training-load/summary
     – Current fitness/fatigue status + interpretation
```

### **Calendar & Programs**
```
GET  /athlete-calendar          – Get week view + sessions + schedule
POST /athlete-select-preset     – Choose weekly preset variant
GET  /training-programs         – List available programs
POST /program-assignment        – Assign program to athlete (coach)
GET  /athlete-program-detail    – Get program details + progress
```

### **Check-ins**
```
GET  /athlete-check-in-form     – Get weekly check-in form
POST /athlete-check-in          – Submit check-in (strength/running compliance, fatigue, notes)
```

---

## 🔐 Security Model

### **Authentication**
- OAuth via Google (primary)
- JWT signed by Supabase
- Session max age: 24 hours (enforced client-side + server-side)
- Token refresh: automatic via service worker (PWA)

### **Authorization (RLS - Row Level Security)**
```
athletes:
  - Cannot view other athletes' profiles
  - Can see coach name + program info
  - Coaches can see all assigned athletes

strength_plans:
  - Coach who created: full access
  - Coach not assigned: read-only (can duplicate)
  - Athletes: read-only (cannot edit)

training_zones:
  - Coach who set: can edit
  - Athletes: read-only visibility

strength_log_sets:
  - Athlete logs own sets
  - Coach can view athlete's logs
```

### **API Validation**
- All inputs validated server-side (type, bounds, format)
- No raw SQL (parameterized queries only)
- Stripe webhook signature verified
- Strava webhook signature verified

---

## 📊 Data Flow Examples

### **Scenario 1: Athlete Logs a Strength Set**
```
Athlete App (strength/index.html)
  → Calls: POST /strength-log { exercise_id, reps, load_kg, rir, day, week }
  → Backend validates: exercise exists + plan is active
  → Inserts into athlete_training_sessions source='strength_log'
  → Returns: {success, set_id, feedback: "Good effort, great form!"}
  → Frontend updates UI + localStorage (offline resume if needed)
```

### **Scenario 2: Coach Assigns Program with Preset**
```
Coach Dashboard (coach/index.html)
  → Selects athlete + program + start date
  → Calls: POST /program-assignment { athleteId, programId, startDate }
  → Backend:
     1. Creates program_assignments record
     2. Creates strength_plan_instances for each week's strength plan
     3. Creates athlete_weekly_schedules with presets
  → Returns: { success, assignmentId, calendarUrl }
  → Athlete app automatically refreshes calendar → shows new workouts
```

### **Scenario 3: Strava Sync & Training Load**
```
Manual: Coach clicks "Sync Strava" on athlete detail (or cron job runs daily)
  → Calls: POST /strava-sync { athleteId }
  → Backend:
     1. Refresh OAuth token (if needed)
     2. Fetch last 20 activities from Strava API
     3. For each activity:
        - Calculate TSS (rTSS for running, pTSS for cycling)
        - Upsert into athlete_training_sessions
     4. Recalculate daily_training_load (CTL/ATL/TSB for past 42 days)
     5. Return summary: { activitiesFetched: 5, sessionsUpserted: 4, tssCalculated: true }
  → Frontend toasts: "5 activities synced. TSS calculated."
  → Athlete app updates dashboard: CTL/ATL chart refreshes
```

---

## 🎯 Feature-to-Table Mapping

| Feature | Primary Tables | Secondary Tables |
|---------|--------|---|
| **Strength Training** | strength_plans, exercises, strength_plan_exercises, strength_prescriptions, strength_plan_instances, strength_log_sets | athlete_exercise_1rm, strength_plan_phase_notes |
| **Training Zones** | athlete_training_zone_profiles, athlete_training_zones | None |
| **Strava Sync** | athlete_strava_connections, athlete_training_sessions, strava_sync_events | daily_training_load (Phase 2+) |
| **Calendar** | training_programs, program_schedule_presets, program_schedule_sessions, athlete_weekly_schedules, program_assignments | None |
| **Check-ins** | athlete_check_ins | None |
| **Payments** | meta_orders, meta_subscriptions | program_assignments |
| **Monitoring** | daily_training_load (Phase 2+), athlete_training_sessions | athlete_check_ins |

---

## 🔄 Critical Workflows

### **Athlete Onboarding** (Current State)
1. Sign in with Google → create athlete record
2. Answer onboarding survey (sport, level, goals)
3. → Coach assigns strength plan or program preset
4. Athlete sees calendar → selects week's workouts → logs sessions

### **Coach Program Setup** (Current State)
1. Coach logs in
2. Creates strength plan template (or uses existing)
3. Defines exercises + prescriptions per week
4. Creates program (optional: link to training_program for billing)
5. Assigns to athlete → athlete sees calendar

### **Performance Monitoring** (Partial in Phase 1, Full in Phase 2)
1. Athlete trains → logs strength or syncs Strava
2. System calculates TSS + updates CTL/ATL/TSB (Phase 2+)
3. Coach dashboard shows fatigue signals
4. Coach adapts next week's prescription (if compliance/fatigue warrants)

---

## 📈 Scalability Targets

| Resource | Current Est. | Phase 1 Target | Phase 3 Target |
|----------|----------|--------|--------|
| **Coaches** | 1-2 | 5-10 | 50+ |
| **Athletes** | 20 | 50-100 | 500+ |
| **Concurrent Users** | <5 | <20 | 100+ |
| **DB Queries/sec** | <10 | <50 | <500 |
| **API Response Time (p95)** | <200ms | <500ms | <300ms |
| **Storage** | ~500 MB | ~2 GB | ~20 GB |

**Optimization priorities**:
1. Add indexes on athlete_id, date fields (done in migrations)
2. Implement query caching (Redis for CTL/ATL if needed)
3. Archive old log data (>1 year) to cold storage
4. Paginate large result sets (activities, sessions)

---

## 🛠️ Development Conventions

### **Naming**
- Tables: snake_case (athlete_training_zones)
- APIs: kebab-case (/strava-sync, /coach-athlete-training-zones)
- Functions: camelCase (calculateTSS, syncStravaActivities)
- Enums: lowercase values (status: 'active', 'completed')

### **Versioning**
- APIs: No explicit versioning in URL yet; breaking changes = +1 subdomain (v2 if needed)
- Migrations: incremental SQL files in `/scripts/migration-*.sql`
- Schema: track in `supabase-schema.sql` (canonical source)

### **Error Handling**
```javascript
// Standard error response
{ error: "descriptive message", code: "ERROR_CODE", statusCode: 400 }

// Examples:
{ error: "Plan not found", code: "PLAN_NOT_FOUND", statusCode: 404 }
{ error: "Unauthorized", code: "FORBIDDEN", statusCode: 403 }
```

---

## 🧭 Where to Find Things

| Concern | Files |
|---------|-------|
| **Strength backend** | `netlify/functions/strength-plan.js`, `athlete-strength-plan.js` |
| **Strength athlete UI** | `strength/index.html`, `aer-frontend-main/src/pages/atleta/forca.tsx` |
| **Strength coach UI** | `coach/index.html` (lines ~2895-3500) |
| **Strava backend** | `netlify/functions/strava-*.js` |
| **Strava athlete UI** | `aer-frontend-main/src/services/strava.ts`, `aer-frontend-main/src/pages/atleta/perfil.tsx` |
| **Calendar** | `aer-frontend-main/src/pages/atleta/calendario.tsx`, `netlify/functions/program-*.js` |
| **Database schema** | `scripts/supabase-schema.sql`, `scripts/migration-*.sql` |
| **Config** | `netlify/functions/_lib/config.js`, `.env` files |

---

## ⚠️ Known Limitations & Workarounds

| Issue | Status | Workaround |
|-------|--------|-----------|
| No auto-sync of Strava (manual only) | Phase 1 | Coach clicks sync button; Phase 2+ adds cron |
| TSS not calculated | Phase 1 | Phase 2 implementation (formulas ready) |
| Athlete doesn't see zones | Phase 1 | Phase 2 implementation |
| Single coach (no team accounts) | Phase 1 | Designed for; add team in Phase 4 |
| No power meter support | Phase 1 | Can estimate; Phase 2+ native support |
| No wearable integration | Phase 1 | Only Strava; Phase 4 adds Garmin/Apple/Whoop |

---

**Questions on architecture?** Ask in team sync or update this doc as we learn.
