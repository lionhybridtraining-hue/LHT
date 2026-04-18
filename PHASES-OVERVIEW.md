# Phase Planning Overview

Quick reference for each phase. Detailed specs in PRODUCT-ROADMAP.md and PHASE-1-TASKS.md.

---

## 🎯 PHASE 1: Launch Ready (Late April 2026)

**What**: MVP with strength + calendar + basic Strava  
**Owner**: Dev team (2-3w sprint)  
**Status**: 🟡 In Progress (~75% complete as of Apr 17, 2026)  

**Completed**:
- ✅ Strength Backend (100%) + Athlete UI (100%)
- ✅ Calendar/Programa preset-driven (90%)
- ✅ Strava OAuth (100%) + Activity Sync (80%)
- ✅ Blog System (100%)
- ✅ Athlete Profile Flow (100%)
- ✅ Training Zones Backend (85%) + Coach UI (100%)
- ✅ Aggregation Layer — view-models.js (3 composers, 47 E2E tests passing)
- ✅ Aggregated Endpoints: coach-program-blueprint, coach-athlete-profile-unified, coach-calendar-week
- ✅ Admin cleanup endpoint (18 tables, allowlist-only)

**In Progress**:
- 🟡 Strength Coach UI (60%)
- 🟡 Coach Dashboard (40%) — endpoints ready, UI refactor pending
- 🟡 Analytics events (30%)
- 🔴 Training Zones Athlete UI (0%)
- 🔴 Strava TSS Calculation (20% — formulas only)

**Athlete Experience**:
```
Login → Home (see this week's workouts + latest Strava)
     ↓
     Start Strength Workout → Log sets → Complete
     ↓
     Review calendar for next week
```

**Coach Experience**:
```
Login → Coach Dashboard (see athlete status: on-track 🟢 / warning 🟡 / overdue 🔴)
     ↓
     Click athlete → see recent activities
     ↓
     Manual sync if needed
```

**Go/No-go Criteria**:
- [x] 0 critical bugs (core flows stable)
- [ ] API p95 < 500ms (needs validation)
- [ ] Strava sync success rate > 95% (needs validation)
- [x] Mobile responsive (iOS + Android)

**Remaining for Launch**:
- Athlete dashboard home tab (this week's workouts + Strava display)
- Coach dashboard home tab (athlete roster + status)
- Coach manual Strava sync trigger
- Fix Strava OAuth scope (`activity:read_all`)

---

## 📈 PHASE 2: Data-Driven Training (Mid-May 2026)

**What**: Real training load + visible zones + coach intelligence  
**Prerequisites**: Phase 1 shipped & stable  
**Duration**: 4-6 weeks  

### Phase 2.1: Training Load Pipeline
**Task Breakdown** (↓ Priority):
1. TSS calculation (running) — `tss = distance × lactate_factor × hr_adjustment`
2. CTL/ATL/TSB aggregation — daily training loads table + Banister model
3. TSS for power (bike) — Coggan formula or fallback to pace
4. Database migration — add `daily_training_load` table

**Outputs**:
- `{tss, ctl, atl, tsb}` calculated after each Strava sync
- Verified against known test cases (easy run = 40-60 TSS)

### Phase 2.2: Athlete Training Load UI
**New Tab**: "Treino" (Training Load)
- Chart: CTL/ATL/TSB trend (42 days)
- Cards: Current fitness / fatigue / TSB status
- Heatmap: TSS per day (color gradient)
- Interpretation: "You're well-rested, ready for hard week"

### Phase 2.3: Athlete Zone Visibility
**New Tab**: "Zonas"
- Display zones set by coach (Family/Method/Modality)
- Zone table: Z1-Z5 with thresholds + common terms
- Badge on each Strava activity: "Zone 2 exercise" (if HR available)

### Phase 2.4: Coach Monitoring Dashboard
**New Tab**: "Atletas" (Athletes)
- Table: Athlete | Last Session | Days Ago | CTL Trend | Status
- Filter by program / status
- Athlete overlay: 10 activities + CTL sparkline + next workout

### Phase 2.5: Backend Fixes
- Auto-sync scheduler (daily 6am UTC, exponential backoff)
- Training load recalc on CSV import

**Athlete Experience** (Updated):
```
Home → see CTL/ATL/TSB indicators
Treino tab → chart + fatigue signals
Zonas tab → view heart rate thresholds
Activities → marked with zone classification
```

**Coach Experience** (Updated):
```
Atletas tab → see all athlete compliance + load trends
Click athlete → see CTL sparkline + last 10 activities
```

**Go/No-go Criteria**:
- [ ] TSS calculated on 50%+ of activities
- [ ] CTL/ATL chart renders without calculation errors
- [ ] Coach can see overdue athletes at glance
- [ ] Zero misinterpretation of zone classifications

---

## 🧠 PHASE 3: Intelligent Planning (Mid-June 2026)

**What**: Adaptive scheduling + complete coach tools + smart auto-fill  
**Prerequisites**: Phase 2 shipped + CTL/ATL flowing  
**Duration**: 6-8 weeks  

### Phase 3.1: Athlete Running Log
**New Tab**: "Corrida" (Running)
- Log interface: distance + duration + HR + pace
- Validation: pace > 3 min/km
- Save to `training_sessions` source='manual'
- Detail view: splits + zone classification + compare to planned vs actual

### Phase 3.2: Smart Zone Auto-Fill
1. **VDOT-based**:
   - Given VDOT → generate Jack Daniels paces (easy, marathon, threshold, interval, rep)
   - Map to Z1-Z5 automatically
   - Coach sees pre-filled; can override

2. **Power-based** (bike):
   - Given FTP → generate Coggan zones (Z1-Z7 in watts)
   - Display in coach editor

3. **LT1/LT2 Universal**:
   - Define: LT1 = Zone 2 threshold (MLSS)
   - Define: LT2 = Zone 4 threshold (FTP / Lactate Threshold)
   - All methods map to these (HR, power, pace)
   - Store `lt1_watts_estimate` per athlete for conversion

### Phase 3.3: Coach Template Library
- Reusable plan templates (save, version, share)
- Bulk assign to 5+ athletes
- Auto-adjust 1RM per athlete (% of reference)

### Phase 3.4: Adaptive Scheduling (MVP)
**Rules**:
```
IF athlete_compliance < 50% THEN cap_intensity_next_week (-1 zone)
IF athlete_compliance = 100% & TSB > 10 THEN upgrade_easy_sessions (Z2 → Z3)
IF TSB < -15 THEN swap_hard_session_for_easy()
```

Coach reviews suggestions Monday morning; accepts/rejects.

### Phase 3.5: Coach Prescription UI
- Week-by-week editing (table: exercises × weeks)
- Edit inline or modal
- Copy/paste weeks
- Prescription templates (save common structures)

### Phase 3.6: Analytics (Coach)
- Compliance report: % completed per athlete
- Volume tracking: weight per week + TSS per week
- Compare to program prescription

**Athlete Experience** (Updated):
```
Home → see compliance % + TSB status
Corrida tab → log running sessions manually
Zonas → see LT1/LT2 unmapping + zone paces
Activities → system suggests zone adherence
```

**Coach Experience** (Updated):
```
Athletes → see compliance % + fatigue signals
Monday: see "suggested workout adjustments"
Prescriptions → week-by-week editor
Templates → duplicate + bulk assign
Analytics → compliance report + volume trends
```

**Go/No-go Criteria**:
- [ ] Coach can see adaptive suggestions
- [ ] Athlete can manually log running
- [ ] VDOT auto-generates zones correctly (tested)
- [ ] Compliance % > 70% achieved

---

## 🚀 PHASE 4: Autonomous & Scale (Q4 2026+)

**What**: Closed-loop, wearables, predictive, production-scale  
**Prerequisites**: Phase 3 proven + coaching loop validated  
**Duration**: 12-18 months (ongoing)  

### 4.1: Wearable Integration
- Garmin Connect (HR, power, VO2 max)
- Apple Health (HR, HRV, workouts)
- Whoop (strain, recovery, HRV)

### 4.2: Advanced Metrics
- **HRV Monitoring**: Daily tracking + alert coach on drop (infection/overtraining risk)
- **VO2 Max Progression**: Track trend over 8-12w blocks; coach sets targets
- **Recovery Scoring**: CTL/ATL/TSB + HRV + sleep + HR spike → daily 1-10 recovery score

### 4.3: Predictive Planning
- **AI Macro Suggestion**: ← given goal/CTL/time-to-event, suggest 4-week block structure
- **Injury Risk Alerts**: Flag high-volume spike + low recovery → coach notified
- **TP Bidirectional**: LHT ↔ Training Peaks sync (plans, activities, metrics)

### 4.4: Social & Community
- Coach benchmarking: "Your athletes avg CTL: 52 vs network: 48"
- Athlete leaderboards (optional, coach enables)
- Shared recovery challenges

### 4.5: Business Automation
- Auto-subscription renewal + auto-assign new plans
- Lead scoring (engagement → priority for follow-up)
- Affiliate program (referral links + conversion tracking)

**Athlete Experience** (Final):
```
Fully autonomous loop:
Train (any sport) → Wearables capture → Data synced overnight
Next morning: System displays HRV + recovery score + AI-suggested workout adjustment
Coach reviews → Approves → Athlete gets adjusted plan
```

**Coach Experience** (Final):
```
Dashboard: Real-time visibility of 100+ athletes
Alerts: High-risk athletes flagged automatically
Suggestions: AI proposes 4-week blocks + weekly adjustments
Integration: Seamless Training Peaks sync + Strava integration
Analytics: Cohort benchmarking + ROI metrics
```

---

## 📊 Phase Dependencies (Critical Path)

```
Phase 1 (2-3w)
    ↓
Phase 2 (4-6w) — Requires Phase 1 stable
    ├─ TSS backend
    ├─ CTL/ATL aggregation
    ├─ Coach dashboard (requires CTL/ATL)
    └─ Athlete load UI (requires CTL/ATL)
    ↓
Phase 3 (6-8w) — Requires Phase 2 data flowing
    ├─ Running log (independent)
    ├─ Auto-fill (independent)
    ├─ Adaptive rules (requires TSB flowing)
    └─ Coach templates (independent)
    ↓
Phase 4 (12-18m) — Requires Phase 3 loop proven
    ├─ Wearables
    ├─ HRV monitoring
    └─ Advanced metrics
```

**Total Time to Code-Complete Phases 1-3**: ~5-6 months (feasible for 1-2 dev team)

---

## 🧐 Decision Points (Backlog)

### After Phase 1 Ships
- Q: How many real athletes? → Decide Phase 2 budget
- Q: Is Strava syncing reliably? → Decide if auto-sync OK in Phase 2

### After Phase 2 Ships
- Q: Are coaches using dashboard? → Invest in Phase 3 coach tools
- Q: Are athletes checking training load? → Prioritize running log vs wearable

### After Phase 3 Ships
- Q: Are adaptive suggestions adopted? → Invest in AI (Phase 4)
- Q: Are athletes downloading PWA? → Invest in offline support

---

## 🛠️ Ownership Model

| Phase | Dev | Design | QA | Product | Duration |
|-------|-----|--------|----|---------|---------| 
| 1 | 1-2 | shared | 1 | 1 | 2-3w |
| 2 | 1-2 | shared | 1 | 1 | 4-6w |
| 3 | 2 | 1 | 1 | 1 | 6-8w |
| 4 | 2-3 | 1 | 1-2 | 1 | ongoing |

---

## 🎯 Success Definition by Phase

**Phase 1**: Launched without critical bugs; DAU > 10; Strava sync > 95%  
**Phase 2**: Coaches see compliance trends; athletes understand load; CTL/ATL accurate  
**Phase 3**: Coaches adopt adaptive suggestions; athletes manually log >30% of sessions  
**Phase 4**: System runs coaching loop autonomously; wearables integrated; scale to 100+ coaches  

---

**Questions?** Update this file or refer to PRODUCT-ROADMAP.md for details.
