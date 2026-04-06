# LHT Product Roadmap 2026

**Version**: 1.0  
**Last Updated**: April 5, 2026  
**Status**: Active Product Development  
**North Star**: Autonomous training management platform with real-time athlete monitoring, intelligent planning, and closed-loop adaptation.

---

## 📊 Vision & Strategic Goals

**End State (Phase 4, ~12-18 months)**:
1. **Autonomous Loop**: Athlete trains → Wearable captures data → System processes → Coach reviews → Auto-adjust next week
2. **Universal Zones Language**: All methods (FC, pace, power) map to single threshold concept (LT1/LT2 + power in watts)
3. **Self-Serve + Coached**: Programs work standalone (self-serve athletes don't need coach) AND with coaching (coach adds intelligence)
4. **Integrated Ecosystem**: Coach/athlete can move plans between Training Peaks, Strava, LHT seamlessly
5. **Scale**: Support 100+ coaches × 1000+ athletes with predictable operations

---

## 📈 Current State Summary (As of April 5, 2026)

| Area | Status | Completion |
|------|--------|-----------|
| **Strength Backend** | ✅ Complete | 100% |
| **Strength Athlete UI** | ✅ Complete | 100% |
| **Strength Coach UI** | ⚠️ Partial | 60% |
| **Training Zones Backend** | ✅ Complete (family/method MVP) | 85% |
| **Training Zones Coach UI** | ✅ Complete (editor) | 100% |
| **Training Zones Athlete UI** | ❌ Missing | 0% |
| **Strava OAuth** | ✅ Implemented | 100% |
| **Strava Sync** | ✅ Activity ingest | 80% |
| **Strava TSS Calculation** | ⚠️ Formulas only | 20% |
| **Calendar/Programa** | ✅ Preset-driven | 90% |
| **Blog System** | ✅ Complete | 100% |
| **Athlete Profile Flow** | ✅ Complete | 100% |
| **Coach Dashboard** | ⚠️ Partial | 40% |
| **Analytics** | ⚠️ Events sent, no dashboard | 30% |

**Overall**: ~68% complete. Core athlete experience ready. Coach tools & data integration need work.

---

## 🎯 Product Roadmap: Phases & Timeline

### **PHASE 1: LAUNCH READY** (2-3 weeks) 
**Goal**: Ship first version with working strength + basic Strava
**Target Launch**: Late April 2026

#### Phase 1.1: Athlete App Completion
- [ ] **Strength UI Polish**
  - Add "continue last workout" button on dashboard
  - Show workout compliance % on home tab
  - Toast notifications for check-in reminders
  
- [ ] **Athlete Dashboard Home Tab**
  - Display current week (M-D format)
  - Show this week's assigned sessions (strength + running from programa)
  - Quick-access to start today's workout
  - Link to calendar for week view
  - *Estimate*: 2-3 days

- [ ] **Athlete Calendar Tab** (exists, needs polish)
  - Verify preset picker works correctly
  - Show "what's today" indicator
  - Display session details on click (coach notes, target effort)
  - *Estimate*: 1 day

- [ ] **Coach Dashboard Home Tab**
  - List all assigned athletes
  - Show last activity date per athlete
  - Simple "athlete overdue" indicator (no session in 3+ days)
  - *Estimate*: 1-2 days

#### Phase 1.2: Strava Baseline
- [x] **OAuth Connection** (already done)
- [x] **Manual Sync** (already done)
- [ ] **Auto-Display in Dashboard**
  - Show last 5 synced Strava activities in athlete dashboard
  - Display: date, distance, duration, avg HR (if available)
  - Link to Strava activity URL
  - *Estimate*: 1 day

- [ ] **Backend: Missing Strava Permission Fix**
  - Ensure `activity:read_all` scope is requested (for past data)
  - Update OAuth callback to save scope + permissions
  - *Estimate*: 0.5 days

- [ ] **Manual Coach Trigger**
  - Add "Sync Strava" button in coach athlete detail view
  - Show "last synced" timestamp
  - *Estimate*: 0.5 days

**Phase 1 Acceptance Criteria**:
- ✅ Athlete can log in → see this week's workouts (strength + calendar)
- ✅ Athlete can start/complete strength workout
- ✅ Athlete sees last 5 Strava activities on dashboard
- ✅ Coach can assign programs with presets
- ✅ Coach can manually sync Strava per athlete
- ✅ Deploy to production, zero critical errors in first 48h

**Phase 1 Not Included** (saving for Phase 2):
- ❌ TSS calculation
- ❌ Training load graphs
- ❌ Athlete zone visibility
- ❌ Auto-sync scheduling
- ❌ Coach athlete monitoring dashboard

---

### **PHASE 2: DATA-DRIVEN TRAINING** (4-6 weeks)
**Goal**: Real training load insights + visible zones
**Target**: Mid-May 2026

**Dependencies**: Phase 1 shipped + code stable

#### Phase 2.1: Training Load Backend
- [ ] **TSS Calculation (Running)**
  - Implement rTSS: `(distance km × 0.75 × lactate factor / (threshold_pace_sec_per_km)) × (hr_avg / hr_max)^2`
  - Store `tss` value on each Strava-synced training_session
  - Validate against known test cases (e.g., easy run = 40-60 TSS, threshold = 80-120)
  - *Estimate*: 2 days

- [ ] **TSS Aggregation & CTL/ATL/TSB**
  - Implement Banister TISS model (CTL = 42-day weighted average, ATL = 7-day)
  - Create daily_training_load table: athlete_id, date, tss, ctl, atl, tsb
  - Triggered after each /strava-sync call
  - *Estimate*: 2 days

- [ ] **TSS for Power (Bike)**
  - If Strava has power data: use Coggan formula `watts × duration_hours / ftp_watts / 3600 × 100`
  - If no power: fallback to pace (if bike has avg speed)
  - *Estimate*: 1 day

- [ ] **Database Migration**
  - Add `daily_training_load` table (athlete_id, date, tss, ctl, atl, tsb, created_at)
  - Add `tss` column to `athlete_training_sessions`
  - Add FTP estimate table (optional for now)
  - *Estimate*: 0.5 days

#### Phase 2.2: Athlete Training Load UI
- [ ] **Train Load Tab in Dashboard (New)**
  - Chart: last 42 days CTL/ATL/TSB trend
  - Card: "Current CTL (fitness): 52" + "Fatigue (ATL): 28" + "TSB: +24 (fresh)"
  - Weekly heatmap: TSS per day (color gradient)
  - Interpretation hints: "You're well-rested, ready for hard week" or "High fatigue, focus on recovery"
  - *Estimate*: 2 days

- [ ] **Strava Activity Detail**
  - Show TSS calculation inline: "TSS: 78 (threshold pace)"
  - Show contribution to CTL: "Added +2.1 points to CTL"
  - *Estimate*: 1 day

#### Phase 2.3: Athlete Zone Visibility
- [ ] **Training Zones Tab (New)**
  - Display zones set by coach: Family (FC/Performance), Method, Modality
  - Show zone thresholds in table format:
    ```
    Zone 1: 130-145 bpm (Recover, easy pace)
    Zone 2: 146-160 bpm (Endurance, conversational)
    Zone 3: 161-170 bpm (Tempo, uncomfortable)
    Zone 4: 171-178 bpm (Threshold, barely talking)
    Zone 5: 179-190 bpm (VO2/Sprint, max effort)
    ```
  - Link each zone to "common terms" from coach (Friel names, RPE, etc.)
  - *Estimate*: 1.5 days

- [ ] **Zone Validation in Training**
  - On Strava sync: validate if activity HR was "in zone"
  - Show badge: "Zone 2 exercise" or "Zone 3 interval" on activity card (if HR data available)
  - *Estimate*: 1 day

#### Phase 2.4: Coach Monitoring Dashboard
- [ ] **Athlete List with Compliance Signals**
  - Table: Athlete | Last Session | Days Ago | CTL Trend | Status
  - Color code: 🟢 on-track (session last 48h), 🟡 warning (3-7d), 🔴 overdue (7d+)
  - Filter: by program, by compliance status
  - *Estimate*: 1.5 days

- [ ] **Athlete Detail Overlay**
  - Last 10 activities (Strava synced)
  - CTL/ATL sparkline
  - Check-in status (strength compliance this week)
  - Next scheduled workout
  - *Estimate*: 1 day

- [ ] **Bulk Strava Sync Control**
  - Button: "Sync all athletes' Strava" (instead of per-athlete)
  - Show progress: "Syncing 5/15 athletes..."
  - *Estimate*: 1 day

#### Phase 2.5: Backend Pipeline Fixes
- [ ] **Auto-sync Scheduler** (optional for MVP, core for production)
  - Cron job: sync all athletes' Strava daily at 6am UTC
  - Implements exponential backoff (quota-aware)
  - Logs sync events to audit table
  - *Estimate*: 1 day

- [ ] **Training Load Recalc on Import**
  - After CSV upload of historical strength data: recalc daily_training_load
  - Ensure CTL/ATL reflects full history
  - *Estimate*: 0.5 days

**Phase 2 Acceptance Criteria**:
- ✅ Athlete sees CTL/ATL/TSB trend + interpretation
- ✅ Athlete can view their training zones
- ✅ Coach can see "overdue" athletes at a glance
- ✅ TSS calculations verified against test data
- ✅ Any 3 activities logged: CTL/ATL chart should render

---

### **PHASE 3: INTELLIGENT PLANNING** (6-8 weeks)
**Goal**: Adaptive scheduling, complete coach tools, smart auto-fill
**Target**: Mid-June 2026

**Dependencies**: Phase 2 shipped + CTL/ATL working

#### Phase 3.1: Athlete Running Log UI
- [ ] **Running Workout Logging** (new page in athlete app)
  - Interface to log: distance, duration, avg HR, pace
  - Validation: pace > 3 min/km, HR in range
  - Save to `athlete_training_sessions` source='manual'
  - *Estimate*: 2 days

- [ ] **Running Workout Detail**
  - Show splits (if manually entered as JSON)
  - Show effort + zone classification
  - Compare to planned vs actual (if from Strava)
  - *Estimate*: 1.5 days

#### Phase 3.2: Smart Zone Auto-Fill
- [ ] **VDOT Auto-Generate** (complete, not just stub)
  - Given VDOT value: generate Jack Daniels 5 paces (easy, marathon, threshold, interval, rep)
  - Map to training zones: Z1 (easy), Z2 (marathon), Z3 (tempo/threshold), Z4 (interval), Z5 (rep/max)
  - Store in athlete_training_zones
  - Coach UI shows zones pre-filled on save
  - *Estimate*: 1.5 days

- [ ] **Power-Based Zones** (bike focus)
  - Given FTP: generate Coggan zones (Z1-Z7) in watts
  - Display in coach zone editor (alternative to HR)
  - *Estimate*: 1.5 days

- [ ] **LT1/LT2 Universal Mapping**
  - Define concept: LT1 = Zone 2 threshold (max lactate steady state)
  - Define concept: LT2 = Zone 4 threshold (lactate threshold / FTP)
  - All methods map to these thresholds (HR LT1, Power LT1, Pace LT1)
  - Coach schema: store `lt1_watts_estimate`, `lt2_watts_estimate` for each athlete profile
  - *Estimate*: 2 days

#### Phase 3.3: Coach Template Library
- [ ] **Reusable Plan Templates**
  - UI to create plan templates (rename from "draft plans")
  - Share templates across athletes
  - Version templates (v1, v2, etc.)
  - *Estimate*: 2 days

- [ ] **Coach Bulk Actions**
  - Assign same plan to 5+ athletes at once
  - Adjust 1-rep-max per athlete automatically (% of reference)
  - *Estimate*: 1.5 days

#### Phase 3.4: Adaptive Scheduling (MVP)
- [ ] **Compliance-Based Adjustments**
  - If athlete completes <50% workouts: cap intensity next week (downgrade Z4→Z3)
  - If athlete completes 100% + high volumes: suggest recovery week
  - *Estimate*: 2 days

- [ ] **Fatigue-Based Adjustments**
  - If TSB < -15 (very fatigued): swap hard session for easy
  - If TSB > +10 (very fresh): upgrade easy sessions to threshold
  - *Estimate*: 2 days

- [ ] **AI Coach Suggestions** (future: for now, manual coach review)
  - Placeholder: show "Coach recommendation" card on Monday with adaptive suggestion
  - Coach can accept/reject
  - *Estimate*: 1 day

#### Phase 3.5: Coach Prescription UI
- [ ] **Week-by-Week Editing**
  - Table: Week 1-12, each exercise, set/rep/RIR/rest per week
  - Edit inline or modal
  - Copy/paste weeks (for consistency)
  - *Estimate*: 2 days

- [ ] **Prescription Templates**
  - Save common "mesocycle prescriptions" (e.g., "Strength Block", "Hypertrophy Block")
  - Reuse across plans
  - *Estimate*: 1 day

#### Phase 3.6: Analytics Dashboard (Coach)
- [ ] **Compliance Report**
  - Athlete: completed sessions / planned sessions (%)
  - Time period: week, month, program duration
  - Export to CSV
  - *Estimate*: 1.5 days

- [ ] **Volume Tracking**
  - Total weight lifted per athlete per week
  - TSS per athlete per week
  - Compare to program prescription
  - *Estimate*: 1 day

**Phase 3 Acceptance Criteria**:
- ✅ Coach can see adaptive workout suggestions on Monday
- ✅ Athlete can manually log running sessions
- ✅ VDOT auto-generates pace zones correctly
- ✅ Coach can bulk-assign plans
- ✅ Coach sees compliance % + fatigue signals
- ✅ Deployment: zero new errors

---

### **PHASE 4: AUTONOMOUS & SCALE** (12-18 months, ongoing)
**Goal**: Closed-loop, wearable integration, AI-driven coaching
**Target**: Q4 2026 onwards

#### Phase 4.1: Wearable Integration
- [ ] **Garmin Connect Integration**
  - Sync HR, power, VO2 max estimates daily
  - Capture training status alerts
  - *Estimate*: 3-4 weeks

- [ ] **Apple Health Integration**
  - Sync workouts + HRV data
  - *Estimate*: 2-3 weeks

- [ ] **Whoop Integration** (if needed)
  - Sync strain, recovery, HRV
  - *Estimate*: 2-3 weeks

#### Phase 4.2: Advanced Metrics
- [ ] **HRV Monitoring**
  - Track daily HRV (from Garmin/Whoop/Apple Watch)
  - Alert coach if HRV drops (infection risk, overtraining)
  - Adjust prescriptions based on HRV trend
  - *Estimate*: 4-6 weeks

- [ ] **VO2 Max Estimation**
  - Use Strava/Garmin/Apple estimates
  - Track progression over 8-12 week blocks
  - Coach can set targets
  - *Estimate*: 2-3 weeks

- [ ] **Recovery Scoring**
  - Combine CTL/ATL/TSB + HRV + sleep + HR spike on wakeup
  - Daily 1-10 recovery score shown to athlete + coach
  - *Estimate*: 3-4 weeks

#### Phase 4.3: Predictive Planning
- [ ] **AI Macro Adjustment**
  - System suggests 4-week block structure (base, build, peak, recover)
  - Based on: athlete goal, current CTL, time to event
  - Coach approves or modifies
  - *Estimate*: 6-8 weeks

- [ ] **Injury Risk Alerts**
  - System flags: high volume spike, monotonous training, low recovery
  - Coach notified: "High injury risk for [athlete], suggest deload"
  - *Estimate*: 4-6 weeks

- [ ] **Auto-Sync with Training Peaks**
  - LHT ↔ TP bidirectional (plans, activities, metrics)
  - Athlete updates TP, syncs to LHT; coach updates LHT, syncs to TP
  - *Estimate*: 6-8 weeks

#### Phase 4.4: Social & Community
- [ ] **Coach Cohort Data**
  - Coach can see anonymized benchmarking: "Your athletes avg CTL: 52 vs. network avg: 48"
  - *Estimate*: 3-4 weeks

- [ ] **Athlete Social Features**
  - Leaderboards (optional, coach can enable/disable per program)
  - Shared recovery challenges
  - *Estimate*: 4-6 weeks

#### Phase 4.5: Business Automation
- [ ] **Subscription Renewal**
  - Auto-bill on day 30 of program
  - Auto-assign new plan if available
  - *Estimate*: 2-3 weeks

- [ ] **Lead Scoring**
  - System scores leads by: engagement, session completion, metrics quality
  - Coach prioritizes follow-ups
  - *Estimate*: 3-4 weeks

- [ ] **Affiliate Program**
  - Coaches can generate referral links
  - Track conversions
  - *Estimate*: 2-3 weeks

---

## 🛠️ Technical Priorities by Phase

### **Phase 1 (Launch)**
| Task | Complexity | Owner | Estimate |
|------|-----------|-------|----------|
| Athlete home dashboard | Med | Frontend | 1-2d |
| Strava recent activities display | Low | Frontend | 1d |
| Coach sync trigger button | Low | Backend + Frontend | 0.5d |
| **Total** | | | **3-3.5d** |

### **Phase 2 (Data-Driven)**
| Task | Complexity | Owner | Estimate |
|------|-----------|-------|----------|
| TSS calculation (running) | High | Backend | 2d |
| CTL/ATL/TSB pipeline | High | Backend | 2d |
| Training load UI chart | Med | Frontend | 2d |
| Coach monitoring dashboard | Med | Frontend | 2d |
| Zone visibility tab | Low | Frontend | 1.5d |
| **Total** | | | **9.5d (~2 weeks)** |

### **Phase 3 (Intelligence)**
| Task | Complexity | Owner | Estimate |
|------|-----------|-------|----------|
| Running log UI | Med | Frontend | 2d |
| VDOT auto-fill complete | Med | Backend + Frontend | 1.5d |
| Adaptive scheduling MVP | High | Backend | 2d |
| Coach compliance dashboard | Med | Frontend | 1.5d |
| **Total** | | | **7d (~1.5 weeks)** |

---

## 📋 Dependency Graph

```
Phase 1 (Launch)
  ├─ Athlete Home Tab (no dependencies)
  ├─ Strava Activity Display (requires Phase 1.1)
  └─ Coach Sync Button (requires API ready ✅)

Phase 2 (Data)
  └─ Requires Phase 1 shipped + stable
      ├─ TSS Backend (independent)
      ├─ CTL/ATL Aggregation (depends on TSS backend)
      ├─ Coach Dashboard (depends on TSS backend)
      ├─ Athlete Training Load Tab (depends on CTL/ATL)
      └─ Zone Visibility (independent)

Phase 3 (Intelligence)
  └─ Requires Phase 2 shipped + metrics flowing
      ├─ Running Log UI (independent)
      ├─ VDOT Auto-Fill (independent)
      ├─ Compliance Adjustments (depends on logging)
      ├─ Fatigue-Based Adjustments (depends on TSB flowing)
      └─ Coach Templates (independent)

Phase 4 (Autonomous)
  └─ Requires Phase 3 shipped + coaching loop proven
      ├─ Garmin Integration
      ├─ HRV Monitoring
      ├─ TP Bidirectional
      └─ Predictive Planning
```

---

## 🎬 Implementation Guidelines

### **Scope Control (Anti-Patterns)**
❌ **DO NOT** in Phase 1:
- Don't add "athlete zone training" UI (Phase 2)
- Don't implement TSS scoring (Phase 2)
- Don't build coach adaptation UI (Phase 3)
- Don't add wearable integrations (Phase 4)

✅ **DO** in Phase 1:
- Get dashboard working + ship
- Basic Strava display + manual sync
- Verify strength training still works
- Deploy to production + monitor

### **Code Quality Standards**
- [ ] All new code: JSDoc comments (functions)
- [ ] All new code: unit tested (>80% coverage) for business logic
- [ ] All migrations: tested locally first, dry-run on prod backup
- [ ] All APIs: versioned (`/v1/`, `/v2/`)
- [ ] All deployments: feature flags for gradual rollout

### **Launch Checklist (Phase 1)**
- [ ] 0 known critical bugs in production
- [ ] All endpoints tested with real athlete data
- [ ] Strava refresh token working (24h+ lifecycle)
- [ ] Error monitoring wired (Sentry or equivalent)
- [ ] Performance: API p95 < 500ms, UI p95 < 1s
- [ ] Mobile: app works on iOS 14+ / Android 10+
- [ ] Offline: strength app functions without internet
- [ ] Documentation: basic user guides (1-pager per feature)

### **Measurement & KPIs**

**Phase 1 Success Metrics**:
- Athlete DAU (daily active users) > 20
- Average workout completion time > 12 min (no crashes)
- Strava sync success rate > 95%
- Zero data loss on refresh

**Phase 2 Success Metrics**:
- 50% of sessions have TSS calculated
- Coach engagement: >2 logins/week per coach
- CTL/ATL rendering stable (no calculation errors)

**Phase 3 Success Metrics**:
- Athlete compliance > 70% (planned vs completed)
- Adaptive suggestions adopted by coach > 50%
- Athlete manual logging > 30% of sessions (complement to Strava)

---

## 📅 Timeline Summary

| Phase | Duration | Launch | Key Deliverable |
|-------|----------|--------|-----------------|
| **1** | 2-3w | Late April | MVP: strength + calendar + basic Strava |
| **2** | 4-6w | Mid-May | Training load + coach dashboard |
| **3** | 6-8w | Mid-June | Adaptive planning + full coach tools |
| **4** | 12-18m | Q4 2026+ | Autonomous, wearables, scale |

**Total to Full Feature Release**: ~5-6 months (Phases 1-3).  
**Ongoing**: Phase 4 features, maintenance, optimization.

---

## 🔄 Review & Governance

- **Weekly Check-In**: Team review of blocked tasks, scope creep
- **Phase Gate**: Product owner signs off before moving to next phase
- **Sprint Planning**: 2-week sprints, 3-4 tasks per developer
- **Documentation Update**: After each phase, update this roadmap

---

## 📝 Notes for Future Iterations

### Questions to Revisit (Backlog)
1. **Running workout form**: Should coach prescribe "Z2 for 60 min" or just "easy run for 60 min"?
   - Decision: Coach prescribes zones; athlete logs actual; system validates adherence
   
2. **Multi-sport scaling**: How to handle athletes with run + bike + swim + strength?
   - Decision: CTL/ATL aggregate across all modalities; zone profiles per modality
   
3. **Power meter adoption**: Should we assume cyclists have power meters?
   - Decision: MVP assumes NO power meters (use pace fallback); Phase 2+ offers power as upgrade
   
4. **Coach AI training**: What should AI suggest if coach is new?
   - Decision: Phase 3 = "coach review required"; Phase 4 = AI can auto-apply low-risk changes

### Known Limitations (By Design)
- **Garmin/Whoop** integration deferred to Phase 4 (MVP uses Strava only)
- **Power zones** deferred to Phase 2+ (MVP uses HR + pace only)
- **Event-based planning** deferred to Phase 3+ (MVP: coach sets fixed schedule)
- **Team management** deferred (single coach focus for MVP)

### Tech Debt to Address (In Parallel)
- [ ] Migrate coach/index.html from vanilla JS to React (ongoing, low priority)
- [ ] Add Typescript to all Netlify functions (ongoing)
- [ ] Optimize strength app initial load (PWA caching strategy)
- [ ] Set up E2E tests for critical workflows (Cypress/Playwright)

---

## ✅ How to Use This Roadmap

1. **Planning**: At start of sprint, pick top 3 tasks from current phase
2. **Blocking**: If blocked, escalate to product owner; don't jump to next phase
3. **Shipping**: After each phase ships, demo to stakeholders; gather feedback
4. **Updating**: Edit this file after each phase; keep timeline realistic
5. **Communicating**: Share with all coaches/athletes; be transparent on delays

**This document is the single source of truth. Any deviation must be approved by the product owner.**

---

**Questions?** Contact the product team. Let's ship Phase 1 by late April. 🚀
