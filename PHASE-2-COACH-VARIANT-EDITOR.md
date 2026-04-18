# Phase 2 Kickoff: Coach Variant Editor API & UI

**Prepared by:** Backend team (Phase 1)
**For:** Coach UI engineer (Phase 2A) + Backend engineer (Phase 2B)
**Date:** 2026-04-17 (updated)

---

## Overview

Phase 2 builds the **coach-facing variant management system**. This document shows:
1. What API endpoints Phase 2B must implement
2. What UI components Phase 2A must build
3. How they interact with Phase 1 database layer

**Update (Apr 17, 2026):** The read-side aggregation layer is now complete:
- `GET /coach-program-blueprint?programId=X` — returns full program + variants + presets + slots + sessions in a single call
- `GET /coach-athlete-profile-unified?athleteId=X` — unified athlete profile with VDOT + zones + 1RM + assignments
- `GET /coach-calendar-week?athleteId=X` — materialized weekly plan
- All 47 E2E tests passing. See `_lib/view-models.js` and `scripts/test-view-models-e2e.js`.
- The coach UI refactor (Phase 2A) should consume these aggregated endpoints instead of making multiple separate API calls.

---

## Phase 2A: Backend Variant Endpoints (2B owner — Backend)

### Prerequisites
- Phase 1 migration applied ✅
- `netlify/functions/_lib/supabase.js` variant CRUD functions available ✅

### Endpoints to Create

#### 1. List Variants for a Program
**Endpoint:** `GET /api/admin-variants?program_id=UUID`

```javascript
// netlify/functions/admin-variants.js — GET handler
async function handleGet(context) {
  const { program_id } = context.query;
  
  // Use Phase 1 helper
  const variants = await getVariantsForProgram(config, program_id);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      program_id,
      variants, // Array of variant objects
      count: variants.length
    })
  };
}
```

**Response:**
```json
{
  "program_id": "abc-123",
  "count": 18,
  "variants": [
    {
      "id": "var-001",
      "duration_weeks": 4,
      "experience_level": "beginner",
      "weekly_frequency": 3,
      "strength_plan_id": "sp-001",
      "running_plan_template_id": "rpt-001",
      "running_config_preset": {
        "initial_weekly_volume_km": 25,
        "weekly_progression_pct": 5
      }
    },
    // ... more variants
  ]
}
```

---

#### 2. Create Single Variant
**Endpoint:** `POST /api/admin-variants`

```javascript
async function handlePost(context) {
  const payload = context.body; // JSON
  
  // Validate
  if (!payload.training_program_id || !payload.strength_plan_id) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  
  // Use Phase 1 helper
  const variant = await createVariant(config, payload);
  
  return {
    statusCode: 201,
    body: JSON.stringify(variant)
  };
}
```

**Request body:**
```json
{
  "training_program_id": "abc-123",
  "duration_weeks": 6,
  "experience_level": "intermediate",
  "weekly_frequency": 5,
  "strength_plan_id": "sp-002",
  "running_plan_template_id": "rpt-001",
  "running_config_preset": {
    "initial_weekly_volume_km": 30,
    "weekly_progression_pct": 4
  }
}
```

---

#### 3. Create Variants in Batch (Template Generator)
**Endpoint:** `POST /api/admin-variants/batch`

```javascript
async function handleBatch(context) {
  const { payloads } = context.body;
  
  // Example: Coach selected "Generate 4W/6W/8W × Beginner/Int/Adv × 3x/5x"
  // System constructs 18 rowsand sends here
  
  const variants = await createVariantsBatch(config, payloads);
  
  return {
    statusCode: 201,
    body: JSON.stringify({
      created: variants.length,
      variants
    })
  };
}
```

**Request body:**
```json
{
  "payloads": [
    { "training_program_id": "prog-1", "duration_weeks": 4, "experience_level": "beginner", "weekly_frequency": 3, "strength_plan_id": "push-4w", "running_plan_template_id": "rpt-base", "running_config_preset": {...} },
    { "duration_weeks": 4, "experience_level": "beginner", "weekly_frequency": 5, ... },
    // ... 16 more
  ]
}
```

---

#### 4. Update Variant
**Endpoint:** `PATCH /api/admin-variants/:id`

```javascript
async function handlePatch(context) {
  const { id } = context.params;
  const patch = context.body; // Partial update
  
  const variant = await updateVariant(config, id, patch);
  
  return {
    statusCode: 200,
    body: JSON.stringify(variant)
  };
}
```

**Use cases:**
- Update running_config_preset (coach tweaks volume)
- Change strength_plan_id (coach swaps plan)
- Rename or re-categorize variant (future)

---

#### 5. Delete Variant
**Endpoint:** `DELETE /api/admin-variants/:id`

```javascript
async function handleDelete(context) {
  const { id } = context.params;
  
  // Check: is variant in-use? (safety check)
  const assignments = await supabaseRequest({...}, `program_assignments?selected_variant_id=eq.${id}&select=count`);
  
  if (assignments && assignments.length > 0) {
    return { statusCode: 409, body: 'Variant in use by active assignments' };
  }
  
  const result = await deleteVariant(config, id);
  
  return {
    statusCode: 204,
    body: ''
  };
}
```

---

#### 6. Set Default Variant (Optional)
**Endpoint:** `POST /api/admin-variants/default`

```javascript
async function handleDefault(context) {
  const { program_id, variant_id } = context.body;
  
  const program = await setDefaultVariant(config, program_id, variant_id);
  
  return {
    statusCode: 200,
    body: JSON.stringify(program)
  };
}
```

---

### Endpoint Summary Table

| Method | Path | Purpose | Uses Phase 1 Function |
|--------|------|---------|----------------------|
| GET | `/api/admin-variants?program_id=X` | List all variants | `getVariantsForProgram()` |
| POST | `/api/admin-variants` | Create 1 variant | `createVariant()` |
| POST | `/api/admin-variants/batch` | Create N variants (template) | `createVariantsBatch()` |
| PATCH | `/api/admin-variants/:id` | Edit variant | `updateVariant()` |
| DELETE | `/api/admin-variants/:id` | Delete variant | `deleteVariant()` |
| POST | `/api/admin-variants/default` | Set default | `setDefaultVariant()` |

---

## Phase 2B: Coach Variant Editor UI (2A owner — Coach UX)

### Screens to Build

#### Screen 1: Variant List (Program Settings)
**Path:** Coach program editor → "Manage Variants" tab

**Layout:**
```
┌─────────────────────────────────────────┐
│ Manage Variants for [Program Name]      │
├─────────────────────────────────────────┤
│ [Generate New Variants] [Import Template] │
├─────────────────────────────────────────┤
│ Variant                    | Strength   | Running      | Actions      │
├─────────────────────────────────────────┤
│ 4W Beginner 3×/week       | Push-4W    | Base (25km)   | [Edit][Del]  │
│ 4W Beginner 5×/week       | Push-4W    | Base (25km)   | [Edit][Del]  │
│ 4W Intermediate 3×/week   | Push-4W    | Base (25km)   | [Edit][Del]  │
│ ...                       | ...        | ...          | ...          │
│ 8W Advanced 6×/week       | Push-8W    | Base (35km)   | [Edit][Del]  │
└─────────────────────────────────────────┘
```

**Features:**
- Fetch variants via `GET /api/admin-variants?program_id=X`
- Show 18-20 rows (paginate if >50)
- Sort by duration, level, frequency
- Delete variant (confirm dialog)
- Edit variant (open modal)

**API calls:**
- GET `/api/admin-variants?program_id=X` (on mount, or when user refreshes)
- DELETE `/api/admin-variants/:id` (on delete action)
- Redirect to edit modal on "Edit" click

---

#### Screen 2: Generate Variants (Modal)
**Trigger:** "Generate New Variants" button

**Dialog:**
```
┌─────────────────────────────────────────┐
│ Generate Variant Template               │
├─────────────────────────────────────────┤
│                                         │
│ Step 1: Select Base Strength Plan       │
│ [Dropdown: Push Full Body | Pull | ...] │
│                                         │
│ Step 2: Clone to Durations              │
│ [✓] 4 weeks  [✓] 6 weeks  [✓] 8 weeks  │
│                                         │
│ Step 3: Select Running Template         │
│ [Dropdown: Base Build | Peak | ...]     │
│ Config: Initial volume [___] km         │
│                                         │
│ Step 4: Frequency Variations            │
│ [✓] 3×/week  [ ] 4×/week  [✓] 5×/week  │
│                                         │
│ Step 5: Experience Levels               │
│ [✓] Beginner [✓] Intermediate [✓] Adv  │
│                                         │
│ [Preview (X variants)] [Cancel] [Save]  │
└─────────────────────────────────────────┘
```

**Preview output:**
```
Will create 3 × 3 × 2 = 18 variants:
- 4W Beginner 3x, 5x
- 4W Intermediate 3x, 5x
- 4W Advanced 3x, 5x
- 6W Beginner 3x, 5x
...
- 8W Advanced 3x, 5x
```

**On Save:**
- Build cartesian product of selections
- For each combo, create payload:
  ```json
  {
    "training_program_id": "prog-1",
    "duration_weeks": 4,
    "experience_level": "beginner",
    "weekly_frequency": 3,
    "strength_plan_id": "push-4w",
    "running_plan_template_id": "rpt-base",
    "running_config_preset": {
      "initial_weekly_volume_km": 25,
      "weekly_progression_pct": 5
    }
  }
  ```
- POST to `/api/admin-variants/batch` with all payloads
- Show success toast: "Created 18 variants ✅"

---

#### Screen 3: Edit Variant (Modal)
**Trigger:** "Edit" action on variant row

**Dialog:**
```
┌─────────────────────────────────────────┐
│ Edit Variant: 6W Intermediate 5×        │
├─────────────────────────────────────────┤
│                                         │
│ Duration     [6 weeks]  (read-only)     │
│ Level        [Intermediate]  (r/o)      │
│ Frequency    [5 per week]  (r/o)        │
│                                         │
│ Strength Plan  [Dropdown: Push-6W]      │
│ Running Template [Dropdown: Base Build] │
│                                         │
│ Running Config (JSON editor or form)    │
│ Initial Volume       [__30__] km        │
│ Weekly Progression   [__4__] %          │
│ Periodization Type   [Linear ▼]         │
│                                         │
│ [Cancel] [Save]                         │
└─────────────────────────────────────────┘
```

**On Save:**
- PATCH `/api/admin-variants/:id` with changes
- Close modal, refresh variant list

**API calls:**
- PATCH `/api/admin-variants/:id` (on save)

---

### Phase 2B Implementation Checklist

**Files to Create/Modify:**

```
netlify/functions/
├── admin-variants.js (NEW)  — Main endpoint handlers
└── admin-variants-batch.js (NEW)  — Batch generator (optional: can be in admin-variants.js)

coach/
├── variant-editor.js (NEW)  — Coach UI logic
└── index.html (MODIFY)  — Add "Manage Variants" tab + modals

aer-frontend-main/src/services/
├── variant-service.ts (NEW)  — Fetch variants, filtering  [optional: can be in athlete context]
```

**Endpoint Development Order:**
1. GET (list) — easiest, needed for fetch
2. POST (single) — needed for testing
3. POST /batch (template) — core feature
4. PATCH (edit) — coach feedback
5. DELETE (remove) — cleanup

---

## How Phase 2 Connects to Phase 3

**Phase 3 will:**
- Refactor `athlete-weekly-plan.js` to read `selected_variant_id` instead of `selected_preset_id`
- Call `getVariantById()` to fetch variant metadata
- Use variant's `strength_plan_id` + `running_config_preset` to generate calendar

**Phase 2 must ensure:**
- Variants are created with valid strength_plan_id + running_plan_template_id FKs
- running_config_preset JSONB is well-formed (so Phase 3 can parse it safely)
- Variants marked for use have all required fields

---

## Reference: Phase 1 Functions Available

From `netlify/functions/_lib/supabase.js`, Phase 2B can use:

```javascript
// Fetch
getVariantsForProgram(config, programId)              → Array<Variant>
filterVariants(config, {programId, ...})              → Array<Variant>
getVariantById(config, variantId)                     → Variant | null
getStrengthPlanFull(config, strengthPlanId)           → StrengthPlan (for dropdowns)
getRunningPlanTemplateById(config, templateId)        → RunningTemplate (for dropdowns)

// Create
createVariant(config, payload)                        → Variant
createVariantsBatch(config, payloads)                 → Array<Variant>

// Update
updateVariant(config, variantId, patch)               → Variant

// Delete
deleteVariant(config, variantId)                      → count (0 or 1)

// Utility
setDefaultVariant(config, programId, variantId)       → Program
```

All are async, all handle errors via try/catch or Promise rejection.

---

## Testing Phase 2 Completeness

Once Coach Variant Editor is live:
1. Go to Program Settings → Manage Variants
2. Click "Generate Variants"
3. Pick a strength plan, running template, durations, frequencies
4. Complete workflow → 18 variants created
5. Verify in Supabase Studio: `SELECT * FROM program_variants WHERE training_program_id = 'X'` shows 18 rows
6. Edit one variant → change running config
7. Delete one variant → confirm warning appears

---

## Quick Start Template

**File:** `netlify/functions/admin-variants.js`

```javascript
const { getVariantsForProgram, createVariantsBatch, /* etc */ } = require('./_lib/supabase');

exports.handler = async (event) => {
  const config = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  try {
    if (event.httpMethod === 'GET') {
      const { program_id } = event.queryStringParameters;
      const variants = await getVariantsForProgram(config, program_id);
      return {
        statusCode: 200,
        body: JSON.stringify({
          program_id,
          count: variants.length,
          variants
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body);
      const variant = await createVariant(config, payload);
      return {
        statusCode: 201,
        body: JSON.stringify(variant)
      };
    }

    // ...PATCH, DELETE, etc.

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
```

---

## Questions Before Phase 2 Starts?

- **On API contracts?** → See endpoint specs above
- **On coach UI flow?** → See wireframes in screens above
- **On backend setup?** → See netlify/functions patterns in repo
- **On variant data model?** → See PHASE-1-VARIANTS-ARCHITECTURE.md

---

**Ready to implement Phase 2?** Tackle endpoints first (2B), then UI (2A). Parallel development is OK once contracts are locked.

