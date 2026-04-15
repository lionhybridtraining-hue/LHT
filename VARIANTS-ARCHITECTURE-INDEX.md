# Multi-Variant Training Program Architecture — Documentation Index

**Date:** 2026-04-14
**Status:** Phase 1 Implementation Complete ✅
**Next:** Phase 1 Verification (Migration Application) + Phase 2 Planning

---

## Quick Navigation

### For Developers
| Document | Purpose | Audience |
|----------|---------|----------|
| **[PHASE-1-VARIANTS-ARCHITECTURE.md](./PHASE-1-VARIANTS-ARCHITECTURE.md)** | Complete design + schema + decisions | Architects, Full-stack devs |
| **[PHASE-1-VARIANTS-SETUP.md](./PHASE-1-VARIANTS-SETUP.md)** | Step-by-step migration guide + verification SQL | DBA, Backend team |
| **[PHASE-2-COACH-VARIANT-EDITOR.md](./PHASE-2-COACH-VARIANT-EDITOR.md)** | Phase 2 API specs + UI wireframes | Backend (Phase 2B), Coach UI engineer (Phase 2A) |
| **[plan.md](./memories/session/plan.md)** (session memory) | Session log + implementation notes | Project owner |

### For Project Managers
- **Status:** Phase 1 ✅ implementation done, ⏳ verification pending
- **Effort:** 3-4h Phase 1 (implementation) + 2-3h Phase 1 (verification) = **~6h total Phase 1**
- **Timeline:** Phase 2-4 can run in parallel, ~35-40h total engineering effort
- **Blockers:** Phase 1 migration must be applied before Phase 2 starts

### For Non-Technical
- **What was built:** Foundation for multi-variant training programs (supporting 10-20+ variants per program)
- **Why:** Current system isn't organized for scale; variants are disorganized
- **Impact:** Coaches can create variants in bulk, athletes get better discovery UI
- **Next:** Apply migration to database (DBA task = 1-2h), then build coach editor UI (2 weeks)

---

## What's Included

### Phase 1 Deliverables ✅

**Database Layer (Schema)**
- `scripts/migration-program-variants-table.sql` — Full migration (300 lines)
  - New table: `program_variants` (11 columns)
  - New indexes: 6 for fast queries
  - New FKs: 3 (program_assignments, training_programs, athlete_weekly_plan)
  - Helper functions: 2 PostgreSQL functions for filtering

**Backend Layer (API Functions)**
- `netlify/functions/_lib/supabase.js` — Variant CRUD helpers (190 lines added)
  - `getVariantsForProgram()` — Fetch all for program
  - `filterVariants()` — Filter by metadata (duration, level, frequency)
  - `getVariantById()` — Fetch 1 with FK details
  - `createVariant()` — Create 1
  - `createVariantsBatch()` — Create N (coach template)
  - `updateVariant()` — Edit
  - `deleteVariant()` — Delete
  - `setDefaultVariant()` — Mark recommended

**Documentation**
- `PHASE-1-VARIANTS-ARCHITECTURE.md` — Complete design + decisions + future work (450 lines)
- `PHASE-1-VARIANTS-SETUP.md` — Setup guide + verification (400 lines)
- `PHASE-2-COACH-VARIANT-EDITOR.md` — Phase 2 specs + API contract (500 lines)
- This file — Navigation + summary

---

## How to Use These Docs

### Scenario 1: "I need to apply the migration"
→ Open **PHASE-1-VARIANTS-SETUP.md**, follow Steps 1-2 (application + verification)

### Scenario 2: "I'm building Phase 2 coach endpoints"
→ Open **PHASE-2-COACH-VARIANT-EDITOR.md**, copy endpoint templates, reference Phase 1 functions

### Scenario 3: "I need to understand the variant data model"
→ Open **PHASE-1-VARIANTS-ARCHITECTURE.md** section "What Was Built" or "Data Flow"

### Scenario 4: "What decisions were made and why?"
→ Open **PHASE-1-VARIANTS-ARCHITECTURE.md** section "Key Decisions Made"

### Scenario 5: "I want to know Phase 3-4 impact"
→ Open **plan.md** section "Phases" or **PHASE-1-VARIANTS-ARCHITECTURE.md** section "Next: Phase 2-4"

---

## Phase Breakdown & Effort

| Phase | Owner | Duration | Effort | Status |
|-------|-------|----------|--------|--------|
| **1: Schema** | Backend + DBA | 3-4h implementation<br>2-3h verification | ~6h total | ✅ Implementation done<br>⏳ Verification pending |
| **2: Coach Editor** | Coach UI +<br>Backend (endpoints) | 2 weeks design+build+test | ~32h | 🚫 Not started |
| **3: Calendar Gen** | Backend | 1-2 weeks | ~16h | 🚫 Blocked by Phase 1 verify |
| **4: Athlete UX** | Frontend | 1-2 weeks | ~16h | 🚫 Blocked by Phase 2 endpoints |
| **Total** | Multi-team | ~1 month | ~70h | ✅ Design done |

---

## Key Files Reference

### Migration & Schema
```
scripts/migration-program-variants-table.sql
  ├── Creates program_variants table
  ├── Applies indexes + triggers
  └── Creates helper functions (PostgreSQL)
```

### Backend Functions
```
netlify/functions/_lib/supabase.js
  ├── getVariantsForProgram()
  ├── filterVariants()
  ├── getVariantById()
  ├── createVariant()
  ├── createVariantsBatch()
  ├── updateVariant()
  ├── deleteVariant()
  └── setDefaultVariant()
```

### Related Tables (Pre-existing)
```
training_programs        (extended: +default_variant_id)
program_assignments     (extended: +selected_variant_id)
strength_plans          (existing)
running_plan_templates  (existing)
athlete_weekly_plan     (extended: +generated_from_variant_id)
```

---

## Data Model Summary

**Variant = Unique Combination**
```
program_variant {
  id (PK)
  program_id (FK)
  duration_weeks (4|6|8)
  experience_level (beginner|intermediate|advanced)
  weekly_frequency (3|4|5|6)
  
  strength_plan_id (FK) — explicit
  running_plan_template_id (FK) — parametric
  running_config_preset {JSON} — scales template
  
  created_by, created_at, updated_at
}
```

**Example:** 18 variants of "Base Building" program
```
Base Building - 4W Beginner 3x/week   → push-4w,  base-template + {25km, 5%}
Base Building - 4W Beginner 5x/week   → push-4w,  base-template + {25km, 5%}
Base Building - 4W Intermediate 3x/week → push-4w, base-template + {25km, 5%}
...
Base Building - 8W Advanced 6x/week    → push-8w, base-template + {35km, 3%}
```

---

## Verification Checklist Before Phase 2

- [ ] Migration applied to Supabase SQL
- [ ] `program_variants` table visible in Schema Inspector
- [ ] All 11 columns present
- [ ] Indexes built (check pg_indexes)
- [ ] Helper functions registered (check pg_routines)
- [ ] Backend functions compile without errors
- [ ] Integration test passes (optional, but recommended)

---

## Next Steps

### Immediate (This Week)
1. **DBA applies migration** (2-3 hours)
   - Run SQL in Supabase Studio or via CLI
   - Verify schema
   - Sign off ✅

2. **Document reviewed** by architects
   - Confirm design before Phase 2 starts
   - Surface any questions

### Week 2
3. **Phase 2 Planning**
   - Assign backend engineer (endpoints)
   - Assign coach UI engineer (editor)
   - Kickoff: Define API contract lock-in + UI design

4. **Phase 2 Development Starts**
   - Backend: Create `/api/admin-variants` endpoints
   - Coach UI: Build "Manage Variants" tab + modals

### Parallel (After Phase 2 endpoints)
5. **Phase 3 Starts** — Backend refactors calendar generation
6. **Phase 4 Starts** — Frontend builds athlete variant picker

---

## Questions & Support

**For schema questions:**
- Read: PHASE-1-VARIANTS-ARCHITECTURE.md sections "What Was Built" or "Data Flow"
- File: `scripts/migration-program-variants-table.sql` (with detailed comments)

**For Phase 2 specifications:**
- Read: PHASE-2-COACH-VARIANT-EDITOR.md

**For setup/verification:**
- Read: PHASE-1-VARIANTS-SETUP.md (step-by-step + SQL queries)

**For design decisions:**
- Read: PHASE-1-VARIANTS-ARCHITECTURE.md section "Key Decisions Made"

**For timeline/effort:**
- Look at Phase Breakdown table above ⬆️

---

## Summary

✅ **Phase 1 is complete.** Schema foundation is in place.

⏳ **Verification is next.** DBA applies migration, confirms schema.

🚀 **Phase 2 begins after verification.** Coaches get variant editor UI; team builds endpoints.

→ **See individual documents for detailed specs, API contracts, and implementation guides.**

---

**Document Version:** 1.0
**Last Updated:** 2026-04-14
**Owner:** Backend Architecture Team

