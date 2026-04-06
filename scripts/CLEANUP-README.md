# Cleanup Script for Test Account

**Test Account Email:** `rodrigolibanio1999@gmail.com`

This account is used for testing all funnel flows. Use these scripts to reset it and test as a fresh athlete.

## Option 1: Direct SQL Execution (via Supabase Dashboard)

### Quick Cleanup

Use the simpler script if you just need to delete and recreate:

```sql
-- Copy and paste the contents of cleanup-athlete-test-account.sql
-- into Supabase Dashboard > SQL Editor
```

**Steps:**
1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select the LHT project
3. Go to **SQL Editor**
4. Create a new query
5. Copy contents of `scripts/cleanup-athlete-test-account.sql`
6. Click **Run**
7. Verify in the output that athlete is deleted

### Detailed Cleanup with Logging

For more visibility into what's being deleted:

```sql
-- Copy and paste the contents of cleanup-athlete-test-account-v2.sql
-- Includes detailed logging for each deletion step
```

## Option 2: Programmatic Cleanup via Admin Function

Create a Netlify Function that can be called from the admin dashboard:

**Endpoint:** `POST /.netlify/functions/admin-cleanup-athlete`

**Request:**
```json
{
  "email": "rodrigolibanio1999@gmail.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Athlete cleanup completed",
  "deletedCounts": {
    "athletes": 1,
    "training_sessions": N,
    "program_assignments": N,
    "strength_plan_instances": N,
    "weekly_checkins": N,
    "leads": N,
    "onboarding": N
  }
}
```

## Option 3: Command Line via psql

If you have direct database access:

```bash
# Connect to LHT database via psql
psql postgresql://user:password@db.supabase.co:5432/postgres

# Run the cleanup
\i scripts/cleanup-athlete-test-account.sql
```

## What Gets Deleted

✅ **Athletes table**
- Main athlete record

✅ **Training data**
- `training_sessions` - all uploaded workouts
- `training_zones` - zone profiles and configurations
- `athlete_strava_connections` - Strava integration data

✅ **Program management**
- `program_assignments` - coach assignments
- `stripe_purchases` - Stripe checkout sessions
- `strength_plan_instances` - strength plan instances
- `athlete_weekly_plan` - weekly training plans

✅ **Interaction history**
- `weekly_checkins` - feedback forms
- `strength_log_sets` - strength workout logs
- `ai_logs` - AI analysis logs

✅ **Lead tracking**
- `leads_central` - funnel tracking records
- `onboarding_intake` - onboarding form responses

## Testing Workflows After Cleanup

### Test 1: Fresh Landing → Form → Plan Generate

1. **Clear browser cache/storage** (or use incognito)
2. Navigate to `/planocorrida`
3. Should see landing page (no auth required initially)
4. Fill landing form (goal distance, frequency, experience, consistency)
5. Click submit → redirects to `/planocorrida/formulario`
6. Fill multi-step form
7. Final submit → should see plan generated
8. Verify in `leads_central`:
   - `funnel_stage = 'plan_generated'`
   - `last_activity_type = 'plan_generated'`
   - `planocorrida_landing.formCompleted = true`

### Test 2: Plan Access Signal

1. After plan generated, login to app
2. Navigate to `/programas` (my programs)
3. Access running program
4. Verify in `leads_central`:
   - `last_activity_type = 'plan_accessed'`
   - `last_activity_at = now()`

### Test 3: PWA Install Signal

1. In Chrome DevTools, simulate `beforeinstallprompt`
2. Trigger app install from address bar
3. Verify in `onboarding_answers`:
   - `pwa.installPromptedAt` exists
   - `pwa.installedAt` exists (on actual install)

### Test 4: Profile Completion

1. Navigate to `/perfil`
2. Fill profile with only core 6 fields:
   - Full Name
   - Phone
   - Date of Birth
   - Height (cm)
   - Weight (kg)
   - Sex
3. Should complete without goal/frequency/experience/consistency
4. Verify no validation errors for those 4 fields

## Safety Notes

⚠️ **This script will permanently delete all data for the test account**
- Database backups are automatic (check Supabase)
- Cannot be undone without restore from backup
- Safe to run repeatedly (idempotent)

⚠️ **Only targets `rodrigolibanio1999@gmail.com`**
- Hard-coded email in script
- Will not affect other athletes
- Requires explicit email match

## Troubleshooting

**"Athlete not found"**
- Verify email is exactly `rodrigolibanio1999@gmail.com`
- Check if account exists: `SELECT * FROM athletes WHERE email = '...'`

**Foreign key constraint error**
- Try the v2 script with explicit deletion order
- Ensure no other references exist

**Partial deletion**
- Client may have disconnected mid-transaction
- Script uses `BEGIN...COMMIT` (atomic)
- Safe to re-run

## Future: Automated Testing

Consider adding end-to-end tests that:
1. Call cleanup before each test suite
2. Programmatically test funnel flows
3. Validate database state at each stage
4. Report on stage transitions

Example test flow (pseudocode):
```javascript
describe('Free plan funnel', () => {
  before(async () => {
    await admin.cleanupAthlete('rodrigolibanio1999@gmail.com');
  });

  it('landing → form → plan_generated → plan_accessed', async () => {
    // Load landing
    // Fill form
    // Submit
    // Login
    // Access programs
    // Assert funnel_stage progression
  });
});
```
