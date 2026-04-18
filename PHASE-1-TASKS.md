# Phase 1: Launch Ready — Detailed Task Breakdown

**Timeline**: 2-3 weeks (Target: late April 2026)  
**Goal**: MVP with working strength + calendar + basic Strava display  
**Owner**: Dev team  
**Status**: 🟡 In Progress (~75% complete as of Apr 17, 2026)

### ✅ Already Completed (Prior to Sprint)
| Area | Completion | Notes |
|------|-----------|-------|
| Strength Backend | 100% | Plans, instances, exercises, prescriptions, logs |
| Strength Athlete UI | 100% | Full workout logging flow |
| Calendar/Programa | 90% | Preset-driven scheduling, needs polish |
| Strava OAuth | 100% | Connection flow working |
| Strava Sync | 80% | Activity ingest working, display pending |
| Blog System | 100% | Supabase-first, static JSON generation |
| Athlete Profile Flow | 100% | Onboarding + settings |
| Training Zones Backend | 85% | Family/method MVP |
| Training Zones Coach UI | 100% | Editor complete |
| Auth (Supabase JWT) | 100% | Google OAuth, migrated from Netlify Identity Mar 18, 2026 |
| Aggregation Layer (view-models.js) | 100% | 3 composers + 3 endpoints + 47 E2E tests (Apr 17, 2026) |
| Admin Cleanup Endpoint | 100% | 18 tables in dependency order, allowlist-only (Apr 17, 2026) |

---

## 📋 Task List (Priority Order)

### **TIER 1: CRITICAL PATH (Must do for launch)**

#### T1.1: Athlete Dashboard Home Tab
**Complexity**: Medium | **Estimate**: 2 days | **Dependencies**: None

**What**:
- New tab in `/planocorrida/atleta` called "Home" or "Início"
- Display:
  - Current week (e.g., "Week of Apr 7-13, 2026")
  - "This Week's Workouts" section:
    - List all sessions assigned this week (from calendar presets)
    - For each: show exercise count (if strength) or distance goal (if run)
    - Show completion status: ✅ done, ⏳ today, ⭕ upcoming
  - Quick-start button: "Begin today's workout" (if applicable)
  - Compliance: "You've completed 3/4 workouts this week"

**Files to Change**:
- `aer-frontend-main/src/pages/atleta/index.tsx` — add Home tab
- `aer-frontend-main/src/pages/atleta/calendario.tsx` — ensure week data available to Home

**Acceptance Criteria**:
- [ ] Tab renders without errors
- [ ] Shows all sessions for the week
- [ ] "Begin workout" button links to strength app
- [ ] Mobile responsive (< 480px)
- [ ] Performance: renders < 500ms

**Notes**: Use existing calendario data; no new API calls needed.

---

#### T1.2: Athlete Dashboard Recent Strava Activities
**Complexity**: Low | **Estimate**: 1 day | **Dependencies**: strava-sync.js works

**What**:
- New section on Home tab (or separate "Activities" tab)
- Display last 5 recent Strava activities:
  - Activity name (e.g., "Early morning run")
  - Date + time (e.g., "Apr 14 @ 6:30 AM")
  - Distance + duration (e.g., "10.2 km · 1h 12m")
  - Avg HR (if available, e.g., "142 bpm avg")
  - Link to Strava activity (external)

**Data Source**:
- GET `/athlete/training-sessions` (already exists): filter by source='strava', last 5

**Files to Change**:
- `aer-frontend-main/src/pages/atleta/index.tsx` — add activities section
- `aer-frontend-main/src/services/strength.ts` or new `activities.ts` — fetch recent sessions

**Acceptance Criteria**:
- [ ] Activities load on page open
- [ ] Clicking activity opens Strava in new tab (if URL available)
- [ ] Graceful fallback if no activities
- [ ] Mobile responsive

**Notes**: If HR is null/missing, just show distance + duration.

---

#### T1.3: Coach Dashboard Home Tab
**Complexity**: Medium | **Estimate**: 1-2 days | **Dependencies**: None

**What**:
- New tab in coach/index.html "Painel Inicial" or keep as default on coach load
- Display:
  - Welcome: "Hello Coach, here's your athlete status"
  - Athlete roster table:
    | Athlete | Program | Last Session | Days Ago | Status |
    | --- | --- | --- | --- | --- |
    | João Silva | Base Block | Apr 14, 6:30 AM | 0d | 🟢 On track |
    | Maria Santos | Build Week | Apr 10, 8:00 PM | 4d | 🟡 Warning |
    | Pedro Costa | Recovery | Apr 5, 12:00 PM | 9d | 🔴 Overdue |
  - Summary cards:
    - "Athletes on track: 5/7"
    - "Synced today: 5/7"

**Files to Change**:
- `coach/index.html` — add new tab + table

**Data Gathering**:
- For each assigned athlete: last training_session date
- Calculate "days ago"
- Apply status logic:
  - 🟢 if last session ≤ 2 days ago
  - 🟡 if last session 3-7 days ago
  - 🔴 if last session > 7 days ago

**Acceptance Criteria**:
- [ ] Table loads without errors
- [ ] Clicking athlete row opens athlete detail (existing flow)
- [ ] Status colors match logic
- [ ] Mobile responsive

**Notes**: This is a summary view; athlete detail already exists in existing UI.

---

#### T1.4: Strava Sync Manual Trigger (Coach)
**Complexity**: Low | **Estimate**: 0.5 days | **Dependencies**: strava-sync.js

**What**:
- In coach athlete detail view: add button "Sincronizar Strava"
- Button triggers POST `/strava-sync` for that athlete
- Show toast: "Syncing..." → "5 activities synced" or error message
- Update "Last synced" timestamp on success

**Files to Change**:
- `coach/index.html` — find athlete detail section, add sync button

**API Used**:
- POST `/strava-sync` (already exists)

**Acceptance Criteria**:
- [ ] Button visible in athlete detail
- [ ] Toast feedback on sync start/end
- [ ] Timestamp updates after sync
- [ ] Error handled gracefully (toast shows error message)

**Notes**: Button should be disabled during sync to prevent double-click.

---

#### T1.5: Fix Strava OAuth Scope (Backend)
**Complexity**: Low | **Estimate**: 0.5 days | **Dependencies**: strava-connect.js

**What**:
- Ensure Strava OAuth requests `activity:read_all` scope (for past data, not just recent)
- Verify scope is saved in `athlete_strava_connections.scope` column
- Test: can sync activities from 6 months ago

**Files to Change**:
- `netlify/functions/_lib/strava.js` — buildAuthorizeUrl function
- Verify scope is: `activity:read_all,activity:read`

**Acceptance Criteria**:
- [ ] OAuth URL includes `activity:read_all`
- [ ] Scope stored in DB after callback
- [ ] Can fetch activities >3 months old

**Notes**: Already partially done; just verify + test.

---

### **TIER 2: POLISH (Nice-to-have for launch)**

#### T2.1: Athlete App Polish
**Complexity**: Low | **Estimate**: 0.5 days

**Changes**:
- Add "continue last workout" quick-link on home if athlete has in-progress session
- Toast notifications for coach check-in reminders (if applicable)
- Improve mobile button sizing on home tab

**Files**: `aer-frontend-main/src/pages/atleta/index.tsx`

---

#### T2.2: Coach App Polish
**Complexity**: Low | **Estimate**: 0.5 days

**Changes**:
- Refresh button on home tab (to update athlete status)
- Color-coded status legend (explain 🟢 🟡 🔴)
- "Sync all athletes' Strava" option (bulk trigger)

**Files**: `coach/index.html`

---

### **TIER 3: NOT IN SCOPE (Phase 1)**

❌ Do NOT do:
- TSS calculation or CTL/ATL graphs (Phase 2)
- Athlete zone visibility UI (Phase 2)
- Adaptive scheduling suggestions (Phase 3)
- Auto-sync scheduling (Phase 2)
- Coach athlete monitoring dashboard detail (Phase 2)

---

## 🧪 Testing & Validation

### **Unit Tests**
- [ ] Athlete home tab: renders without athlete data (loading state)
- [ ] Recent activities: handles empty list
- [ ] Coach dashboard: calculates "days ago" correctly
- [ ] Strava sync button: disables during sync

### **Integration Tests**
- [ ] End-to-end: Coach assigns program → athlete sees workouts on home → can start workout
- [ ] End-to-end: Athlete syncs Strava → activities appear on home
- [ ] End-to-end: Coach triggers sync → sees success toast + timestamp updates

### **Manual Testing (QA Checklist)**
- [ ] Desktop (Chrome, Firefox, Safari): all tabs render correctly
- [ ] Mobile (iOS 14+, Android 10+): responsive layout, no overflow
- [ ] Offline: strength app still works (home tab may show stale data)
- [ ] Strava: actual sync with live Strava account
- [ ] Errors: try cancel sync mid-way, refresh page, see toast persist

### **Performance Testing**
- [ ] Home tab loads in < 1 second
- [ ] Activities list renders < 500ms (even with 100 activities)
- [ ] Coach dashboard sorts 50+ athletes without lag

---

## 🚀 Deployment Checklist

Before merging to `main`:
- [ ] All tasks in TIER 1 ✅ complete
- [ ] No console.error() or warnings (except known safe ones)
- [ ] All tests passing (>80% coverage)
- [ ] Code review approved by 1+ team member
- [ ] UX review: no confusing flows

Before deploying to production:
- [ ] Feature flag enabled (if using feature flags)
- [ ] Rollback plan documented (how to revert)
- [ ] Monitoring alerts set up (error rate, API latency)
- [ ] Notify coaches/athletes of new features

Post-deployment (first 24h):
- [ ] Monitor error logs (Sentry or console)
- [ ] Check performance metrics (API response times)
- [ ] Manual test critical flows (sign in → home → start workout)
- [ ] Respond to user feedback immediately

---

## 📊 Success Metrics (Phase 1 Launch)

**Must Have**:
- Zero critical bugs in production
- All new features working end-to-end
- API response time p95 < 500ms
- No data loss on app refresh

**Should Have**:
- DAU > 10 (initial athletes testing)
- Strava sync success rate > 95%
- Mobile conversion rate > 70% (mobile users = % of DAU)

---

## 🗓️ Weekly Breakdown (Suggested)

**Week 1**:
- Mon-Tues: T1.1 (athlete home tab)
- Wed: T1.2 (recent activities)
- Thu-Fri: T1.3 (coach dashboard)

**Week 2**:
- Mon: T1.4 + T1.5 (Strava fixes + triggers)
- Tue-Wed: Testing + bug fixes
- Thu-Fri: Deploy to staging, QA, code review

**Week 3** (if needed):
- Mon: Monitoring + hotfixes
- Tue-Thu: Polish (T2.1, T2.2)
- Fri: Deploy to prod or plan next phase

---

## 📞 Blockers & Escalation

**If blocked**:
1. Team sync (daily standup): express blocker + proposed solution
2. If unresolved after 24h: escalate to product owner
3. Product owner decides: pivot task, add support, or descope

**Known Risks**:
- Strava API rate limits during sync (mitigation: implement exponential backoff)
- Browser caching issues after deploy (mitigation: cache-busting + service worker)
- Database performance with large athlete rosters (mitigation: add indexes; see monitoring)

---

## ✅ Sign-Off

- **Product Owner**: _________________ (date: _______) 
- **Tech Lead**: _________________ (date: _______ )
- **QA Lead**: _________________ (date: _______ )

---

**Last Updated**: April 17, 2026  
**Next Review**: April 21, 2026 (mid-week sync)
