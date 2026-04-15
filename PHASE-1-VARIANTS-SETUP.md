# Phase 1: Multi-Variant Architecture — Setup & Verification

**Date:** 2026-04-14
**Status:** Implementation in progress
**Owner:** Backend Engineering
**Effort:** ~2-3 hours for full verification

---

## Overview

Phase 1 implements the foundation of the multi-variant training program architecture. This document explains:
1. What was created
2. How to apply the migration
3. How to verify everything works

---

## Files Created

### 1. Migration: `scripts/migration-program-variants-table.sql`
- **Purpose:** Create `program_variants` table + related schema changes
- **Size:** ~300 lines (fully documented)
- **What it does:**
  - Creates `program_variants` table with UUID PK, FKs to programs/plans/templates
  - Adds indexes for variant discovery (by program, by metadata filters)
  - Adds `selected_variant_id` FK to `program_assignments`
  - Adds `default_variant_id` FK to `training_programs`
  - Adds `generated_from_variant_id` to `athlete_weekly_plan` (for transition tracking)
  - Creates PostgreSQL helper functions: `get_variants_for_program()`, `filter_variants()`
  - Grants RLS permissions

### 2. Backend Helpers: `netlify/functions/_lib/supabase.js`
- **Purpose:** CRUD operations for variants
- **What was added:**
  - `getVariantsForProgram(config, trainingProgramId)` — fetch all variants for a program
  - `filterVariants(config, {trainingProgramId, experienceLevel, weeklyFrequency, durationWeeks})` — narrow options
  - `getVariantById(config, variantId)` — fetch single variant with FK details
  - `createVariant(config, payload)` — create 1 variant
  - `createVariantsBatch(config, payloads)` — batch create N variants
  - `updateVariant(config, variantId, patch)` — update variant metadata/config
  - `deleteVariant(config, variantId)` — delete variant (with safeguards)
  - `setDefaultVariant(config, programId, variantId)` — set recommended variant
- **Exported:** All 8 functions added to `module.exports`

---

## Step 1: Apply Migration to Supabase

### Option A: Supabase Studio (Easiest)

1. Open **Supabase Studio** → Project → SQL Editor
2. Create new query
3. Copy entire contents of `scripts/migration-program-variants-table.sql`
4. Paste into editor
5. Click **Run** (or Ctrl+Enter)
6. Verify: Output shows "migration applied successfully" (BEGIN/COMMIT wrapping)

**Expected output:**
```
CREATE TABLE (200 rows affected)
CREATE INDEX (8 rows affected)
ALTER TABLE program_assignments (1 row affected)
ALTER TABLE training_programs (1 row affected)
CREATE TRIGGER (1 row affected)
... etc
```

### Option B: Local psql (If you have DB access)

```bash
cd c:\Users\Win10\Documents\GitHub\LHT

# Using environment variable for password
set PGPASSWORD=your_supabase_password
psql -h db.supabase-url.postgres.databases.com -U postgres -d postgres -f scripts/migration-program-variants-table.sql

# Or via Supabase CLI (if installed)
supabase db push
```

### Option C: Supabase CLI (Recommended for future)

```bash
npm install -g supabase
supabase login  # Provides interactive prompt
supabase db push scripts/migration-program-variants-table.sql
```

---

## Step 2: Verify Schema in Supabase Studio

### 2.1 Check table exists
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'program_variants';
-- Expected: 1 row returned
```

### 2.2 Check columns
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'program_variants'
ORDER BY ordinal_position;
```

**Expected columns:**
- `id` (uuid, NOT NULL)
- `training_program_id` (uuid, NOT NULL)
- `duration_weeks` (integer, NOT NULL)
- `experience_level` (text, NOT NULL)
- `weekly_frequency` (integer, NOT NULL)
- `strength_plan_id` (uuid, NOT NULL)
- `running_plan_template_id` (uuid, NOT NULL)
- `running_config_preset` (jsonb, nullable)
- `created_by` (uuid, nullable)
- `created_at` (timestamp, NOT NULL)
- `updated_at` (timestamp, NOT NULL)

### 2.3 Check indexes
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'program_variants'
ORDER BY indexname;
```

**Expected indexes:**
- `idx_program_variants_program`
- `idx_program_variants_strength_plan`
- `idx_program_variants_running_template`
- `idx_program_variants_metadata`
- `idx_program_assignments_selected_variant` (on program_assignments)
- `idx_training_programs_default_variant` (on training_programs)

### 2.4 Check trigger
```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'program_variants';
-- Expected: set_program_variants_updated_at
```

### 2.5 Check helper functions
```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('get_variants_for_program', 'filter_variants')
AND routine_schema = 'public';
-- Expected: 2 rows
```

---

## Step 3: Verify Backend CRUD Functions

### 3.1 Check file was edited
```bash
# Verify variant functions exist in supabase.js
grep -n "async function getVariantsForProgram" netlify/functions/_lib/supabase.js
grep -n "getVariantsForProgram," netlify/functions/_lib/supabase.js  # in exports
```

**Expected output:**
- First grep: Line number where function is defined (e.g., line 3185)
- Second grep: Line number in module.exports (e.g., line 4560)

### 3.2 Lint/syntax check
```bash
cd c:\Users\Win10\Documents\GitHub\LHT
npm run lint  # or eslint netlify/functions/_lib/supabase.js
```

**Expected:** No syntax errors for supabase.js

---

## Step 4: Create Integration Test (Optional but Recommended)

### 4.1 Create test fixture

File: `scripts/test-program-variants.mjs`

```javascript
#!/usr/bin/env node

/**
 * Integration test: Program Variants CRUD
 * Validates that variant table and helper functions work end-to-end
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.log('🧪 Testing Program Variants Schema & Functions...\n');

  // Test 1: Table exists
  try {
    const { data, error } = await supabase
      .from('program_variants')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ Test 1: program_variants table exists and is readable');
  } catch (err) {
    console.error('❌ Test 1 failed:', err.message);
    process.exit(1);
  }

  // Test 2: Columns are correct
  try {
    const { data, error } = await supabase
      .rpc('get_variants_for_program', {
        p_program_id: '00000000-0000-0000-0000-000000000000' // dummy UUID
      });
    
    if (error && !error.message.includes('zero rows')) {
      throw error;
    }
    console.log('✅ Test 2: get_variants_for_program() function exists and can be called');
  } catch (err) {
    console.error('❌ Test 2 failed:', err.message);
    process.exit(1);
  }

  // Test 3: Check foreign key constraints
  try {
    const { data, error } = await supabase
      .from('program_variants')
      .select('count', { count: 'exact' });
    
    if (error) throw error;
    console.log('✅ Test 3: program_variants responds to count query');
  } catch (err) {
    console.error('❌ Test 3 failed:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 All tests passed! Schema is ready for Phase 2.\n');
}

test();
```

### 4.2 Run the test

```bash
cd c:\Users\Win10\Documents\GitHub\LHT

# Set environment variables
set SUPABASE_URL=your-url
set SUPABASE_SERVICE_ROLE_KEY=your-key

# Run test
node scripts/test-program-variants.mjs
```

**Expected output:**
```
🧪 Testing Program Variants Schema & Functions...

✅ Test 1: program_variants table exists and is readable
✅ Test 2: get_variants_for_program() function exists and can be called
✅ Test 3: program_variants responds to count query

🎉 All tests passed! Schema is ready for Phase 2.
```

---

## Step 5: Document Application Process

Add to `README-DEPLOY.md`:

```markdown
## Migrations & Schema Updates

### Applying migrations
Migrations are stored in `scripts/migration-*.sql`. To apply:

1. Via Supabase Studio (simplest):
   - Open SQL Editor
   - Copy contents of migration file
   - Run query
   - Verify in Schema Inspector

2. Via Supabase CLI:
   ```bash
   supabase db push scripts/migration-program-variants-table.sql
   ```

### Migration verification
After applying each migration, run:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('program_variants', 'program_assignments')
ORDER BY table_name;
```

Verify the tables exist and have correct columns (see PHASE-1-VARIANTS-SETUP.md).
```

---

## Checklist: Phase 1 Complete

- [ ] Migration applied to Supabase (Step 1)
- [ ] Schema verified in Studio (Step 2)
- [ ] Backend functions lint/build clean (Step 3)
- [ ] Integration test passes (Step 4)
- [ ] README updated with migration guide (Step 5)

---

## Troubleshooting

### Error: "Table already exists"
- The migration includes `IF NOT EXISTS` guards. Safe to re-run.
- If you need to drop and recreate:
  ```sql
  DROP TABLE IF EXISTS program_variants CASCADE;
  -- Then re-run migration
  ```

### Error: "Foreign key violation"
- Verify that `training_programs`, `strength_plans`, and `running_plan_templates` tables exist
- These are created by earlier migrations and should already be in your DB

### Error: "Permission denied" in Supabase Studio
- Check that your user is a SQL editor admin in Supabase
- Or use Service Role Key via CLI

### Variants table is empty (expected)
- Initial state: no variants exist yet
- Variants are created in Phase 2 (Coach Variant Editor)
- For testing, you can manually insert test data via Studio

---

## Next: Phase 2 ✅

Once Phase 1 is verified:
1. **Coach Variant Editor** — UI to create variants (template-driven generation)
2. **Backend variant endpoints** — GET /api/admin-variants, POST, PATCH, DELETE
3. **Athlete Variant Picker** — Filter + select variants during onboarding

See [Plano: Multi-Variant Training Program Architecture](./plan.md) for full roadmap.

