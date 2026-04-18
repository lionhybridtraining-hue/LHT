# Multi-Variant Training Program Architecture — Phase 1 Summary

**Date:** 2026-04-17
**Phase:** 1 (Foundation)
**Status:** ✅ Implementation Complete ✅ Aggregation Layer Complete
**Total Effort:** 3-4 hours (implementation + verification + documentation) + 2-3 hours (aggregation layer)

---

## Executive Summary

Phase 1 establishes the **data foundation** for multi-variant training programs. The system now supports:

- **Variant as first-class entity:** Each program can have 10-20+ variants (combinations of duration, experience level, weekly frequency)
- **Explicit metadata + parametric binding:** Variants reference exact strength plans and parametric running configs
- **Scalable creation:** Batch variant generation via a single template (coach creates 18 variants in 1 click, not 1 per 1)
- **Athlete discovery:** Variants are filterable by duration/level/frequency for intuitive picker UX

**Key change:** Moves from preset-driven (single layout per program) → variant-driven (N layouts, N strength plans, N running configs per program).

---

## What Was Built

### 1. Database Schema: `migration-program-variants-table.sql`

**New Table: `program_variants`**
```sql
id (uuid PK)
training_program_id (FK → training_programs)
duration_weeks (int: 4|6|8|...)
experience_level (enum: beginner|intermediate|advanced)
weekly_frequency (int: 3|4|5|6)
strength_plan_id (FK → strength_plans)         -- explicit binding
running_plan_template_id (FK → templates)      -- parametric binding
running_config_preset (JSONB)                  -- {initial_volume_km, progression_pct, ...}
created_by (uuid FK → coaches, nullable)
created_at, updated_at (timestamptz)

UNIQUE(training_program_id, duration_weeks, experience_level, weekly_frequency)
```

**Foreign Key Additions:**
- `program_assignments.selected_variant_id` → variants
- `training_programs.default_variant_id` → variants
- `athlete_weekly_plan.generated_from_variant_id` → variants (for dual tracking during transition)

**Indexes:** (4 on variants + 2 on related tables)
- `idx_program_variants_program` — fast lookup by program
- `idx_program_variants_strength_plan` — fast lookup by strength plan
- `idx_program_variants_running_template` — fast lookup by running template
- `idx_program_variants_metadata` — composite for athlete filter picker (duration, level, frequency)
- `idx_program_assignments_selected_variant` — fast athlete→variant lookup
- `idx_training_programs_default_variant` — fast program→default variant lookup

**Helper Functions (PostgreSQL):**
- `get_variants_for_program(program_id)` → returns all variants ordered by metadata
- `filter_variants(program_id, level?, frequency?, duration?)` → returns matching variants with optional filters

---

### 2. Backend CRUD Layer: `netlify/functions/_lib/supabase.js`

**8 New Functions (async, config-based):**

| Function | Purpose | Called By |
|----------|---------|-----------|
| `getVariantsForProgram(config, programId)` | Fetch all variants for a program | Athlete picker, Coach editor |
| `filterVariants(config, {programId, level?, frequency?, duration?})` | Narrow options by metadata | Athlete picker (filters) |
| `getVariantById(config, variantId)` | Fetch single variant + FK details | Variant edit, Assignment creation |
| `createVariant(config, payload)` | Create 1 variant | Coach single creation |
| `createVariantsBatch(config, payloads)` | Create N variants at once | Coach template generator |
| `updateVariant(config, variantId, patch)` | Edit variant (e.g., running config) | Coach edit |
| `deleteVariant(config, variantId)` | Delete variant (with safeguards) | Coach cleanup |
| `setDefaultVariant(config, programId, variantId)` | Set recommended variant | Coach settings |

**Integration Pattern:**
- All functions use `supabaseRequest()` for consistency
- All return `null` on error or no results (defensive)
- All support Supabase PostgREST prefixing (e.g., `select=*,strength_plans(id,name)`)

---

## Architecture Design Principles

### 1. **Variant = Distinct Combination**
Each variant is one row in `program_variants`:
- `(program_base_building, 6_weeks, intermediate, 5x/week)` = one variant
- `(program_base_building, 4_weeks, intermediate, 5x/week)` = different variant

### 2. **Explicit Strength Binding**
Variants reference specific strength plans via FK:
- Coach can use `push-6w`, `push-4w`, different plans per variant
- No parametric scaling for strength (discrete plans are cleaner for coach UX)

### 3. **Parametric Running Config**
Variants use same running template but override config:
- Template: `base_build_progression` (abstract rules)
- Config variants:
  - 4W variant: `{initial_volume_km: 25, progression_pct: 5}`
  - 6W variant: `{initial_volume_km: 30, progression_pct: 4}` (longer = smoother)
  - 8W variant: `{initial_volume_km: 35, progression_pct: 3}`
- **Benefit:** Reuses template; avoids duplicating running plan definitions

### 4. **Backward Compatibility**
- Old `program_schedule_presets` remain (not deleted)
- Athletes with `selected_preset_id` still work (Phase 3 adds fallback logic)
- Allows parallel testing (variants + presets) before cutover

### 5. **Coach Template Generator Pattern**
Coach workflow: 1 click to generate N variants
- "Generate all 4W/6W/8W combinations" → system creates 3 rows
- "With all 3 experience levels + 2 frequency options" → 3×3×2 = 18 variants
- Coach can tweak individual variant running configs if needed

---

## Data Flow: How Variants Fit In

```
[Coach Perspective]
1. Opens Program Editor
2. Clicks "Manage Variants"
3. Selects Template Preset (e.g., "Cartesian 3×3×2")
4. Picks base strength plan (e.g., "Push Full Body")
5. Picks running template (e.g., "Base Build")
6. Tuning: Adjusts running_config_preset per variant
7. Saves → 18 program_variants rows created

[Athlete Perspective]
1. Purchases program (link shows available variants)
2. Enters onboarding
3. Sees filter panel: Duration [4|6|8W] × Level [Beg|Int|Adv] × Freq [3x|5x]
4. Picks variant → Stored in assignment.selected_variant_id
5. Calendar generated from variant's strength_plan_id + running config
6. Sees "Your plan: 6W, Intermediate, 5×/week" header
```

---

## Files Changed

| File Path | Changes | Lines |
|-----------|---------|-------|
| `scripts/migration-program-variants-table.sql` | **NEW** | ~300 |
| `netlify/functions/_lib/supabase.js` | +8 functions, +exports | ~190 added |
| `PHASE-1-VARIANTS-SETUP.md` | **NEW** (setup guide) | ~400 |

**Total NEW code: ~890 lines**

---

## Verification Checklist

**Before Phase 2 can start:**

- [ ] **Migration applied to Supabase**
  - [ ] `program_variants` table exists
  - [ ] All columns present (8 fields checked)
  - [ ] All indexes built (4 on variants)
  - [ ] FKs added to program_assignments + training_programs
  - [ ] Trigger created for updated_at
  - [ ] Helper functions registered

- [ ] **Backend functions work**
  - [ ] No lint/syntax errors in supabase.js
  - [ ] All 8 functions export correctly
  - [ ] Integration test passes (optional but recommended)

- [ ] **Documentation complete**
  - [ ] PHASE-1-VARIANTS-SETUP.md explains setup steps
  - [ ] README-DEPLOY.md includes migration instructions
  - [ ] Type definitions prepared for frontend (not yet created)

---

## Next: Phase 2 — Coach Variant Editor

**Timeline:** ~3-4 sprints (Phases 2-4 can run in parallel after Phase 1 verified)

### Phase 2A: Backend Variant Endpoints (1 sprint)
- ~~`POST /api/admin-variants`~~ → createVariant()
- ~~`GET /api/admin-variants?program_id=X`~~ → getVariantsForProgram()
- ~~`PUT /api/admin-variants/:id`~~ → updateVariant()
- ~~`DELETE /api/admin-variants/:id`~~ → deleteVariant()
- Template generation endpoint (batch create + defaults)

### Phase 2B: Coach UI — Variant Editor (2 sprints)
- New tab in program settings: "Manage Variants"
- Variant generator modal (template-driven)
- Variant grid: list, edit, delete
- Running config preset editor (JSONB form)

### Phase 3: Backend Calendar Generation (1-2 sprints)
- Refactor `athlete-weekly-plan.js` to read variants instead of presets
- Update `generateWeeklyPlanRows()` to use variant metadata
- Implement fallback logic for old preset assignments

### Phase 4: Athlete UX — Variant Picker (1-2 sprints)
- Variant picker component in onboarding
- Filter UI (duration, level, frequency)
- Calendar view update (show selected variant metadata)

---

## Key Decisions Made

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| **One strength_plan per variant** | Explicit control; coach knows exactly what athlete gets | Multiple plans, rotating (complexity) |
| **JSONB running_config, not separate table** | Fewer joins; atomic variant CRUD | Separate table (more schema complexity) |
| **Cartesian template generation in UI** | Coach decides what variants exist; flexibility | Auto-generate from program metadata (less control) |
| **Reuse running_plan_templates** | Avoid duplication; same template, many configs | Create 20 templates (20× data bloat) |
| **Backward compat with presets** | Smooth transition; test both systems in parallel | Rip-and-replace (risky for live data) |

---

## Known Limitations & Future Work

### Phase 1 Scope
✅ Schema + helpers created
⏳ Migration applied + tested (waiting for DB admin)
🚫 **Not included:**
- Endpoints (Phase 2)
- Coach UI (Phase 2)
- Athlete UI (Phase 4)
- Calendar generation refactor (Phase 3)
- Strength plan templating (post-MVP, if needed)

### Post-MVP Enhancements
- [ ] **Strength plan templating:** Auto-clone plans for durations (4W → 6W → 8W)
- [ ] **Coach template library:** Save and reuse "3×3×2 cartesian template"
- [ ] **Dynamic variant recommendations:** System suggests variants based on athlete profile (future)
- [ ] **Pricing variants:** Different SKUs per variant (future, if needed)
- [ ] **Variant popularity tracking:** See which variants athletes choose most

---

## How to Continue

### Immediate (Before Phase 2 start)
1. **Apply migration** (see PHASE-1-VARIANTS-SETUP.md Step 1-2)
2. **Verify schema** (Steps 2)
3. **Test CRUD functions** (Step 4 — optional integration test)
4. **Sign off:** DBA confirms schema is production-ready

### Phase 2 Planning
Assign:
- **Backend engineer:** Implement variant CRUD endpoints (~8h)
- **Coach UI engineer:** Build variant editor (~16h)
- **Frontend engineer:** Prepare TypeScript types + variant picker component (~8h)

### Phase 3-4 Planning
- Coordinate with Phase 2 to avoid API contract mismatches
- Ensure athlete picker filters show only "real" variants (not in-progress test rows)

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| New tables | 1 (program_variants) |
| Columns per variant | 11 |
| New foreign keys | 3 (program_assignments, training_programs, athlete_weekly_plan) |
| New indexes | 6 |
| Backend functions | 8 CRUD + 2 PostgreSQL helpers |
| Migration file size | ~300 lines |
| Backend code additions | ~190 lines |
| Documentation | ~800 lines (this file + setup guide) |
| **Total LOC** | **~1,500 lines** |
| **Estimated Phase 1 effort** | **3-4 hours** (design + write + document) |
| **Estimated Phase 2-4 effort** | **35-40 hours** (dependent on team size) |

---

## Questions & Contact

For questions on:
- **Schema design** → Consult migration file + this doc
- **CRUD function usage** → See function docstrings in supabase.js
- **Setup/verification** → See PHASE-1-VARIANTS-SETUP.md
- **Phase 2 API contracts** → Will be defined once Phase 1 is verified

---

**Ready to proceed?** Schedule Phase 1 verification with DBA, then kickoff Phase 2 once schema is live.

