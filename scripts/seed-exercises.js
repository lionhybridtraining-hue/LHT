/**
 * Seed exercises into the database from the master exercise catalog.
 * 
 * Usage: node scripts/seed-exercises.js
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (loaded from .env via dotenv if present)
 */

try { require("dotenv").config(); } catch (_) {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ── Exercise catalog ──
// Sourced from "base de dados exercicios.csv"
// Format: { name, category, subcategory, default_each_side?, default_weight_per_side?, default_tempo? }

const EXERCISES = [
  // ── Main Movements ──
  // Hip Dominant
  { name: "Barbell RDL", category: "main_movements", subcategory: "hip_dominant", default_tempo: "3-1-1-0" },
  { name: "DB RDL", category: "main_movements", subcategory: "hip_dominant", default_weight_per_side: true, default_tempo: "3-1-1-0" },
  { name: "Trap Bar Deadlift", category: "main_movements", subcategory: "hip_dominant", default_tempo: "2-0-1-0" },
  { name: "Barbell Hip Thrust", category: "main_movements", subcategory: "hip_dominant", default_tempo: "2-1-1-1" },
  { name: "DB SL RDL", category: "main_movements", subcategory: "hip_dominant", default_each_side: true, default_weight_per_side: true, default_tempo: "3-1-1-0" },
  { name: "Good Morning", category: "main_movements", subcategory: "hip_dominant", default_tempo: "3-1-1-0" },
  { name: "Cable Pull Through", category: "main_movements", subcategory: "hip_dominant", default_tempo: "2-1-1-0" },
  { name: "45° Hip Extension", category: "main_movements", subcategory: "hip_dominant", default_tempo: "2-1-1-1" },
  { name: "Nordic Hamstring Curl", category: "main_movements", subcategory: "hip_dominant", default_tempo: "3-0-X-0" },
  { name: "Glute Bridge", category: "main_movements", subcategory: "hip_dominant", default_tempo: "2-1-1-1" },
  { name: "Kettlebell Swing", category: "main_movements", subcategory: "hip_dominant", default_tempo: "1-0-X-0" },
  { name: "Barbell Deadlift", category: "main_movements", subcategory: "hip_dominant", default_tempo: "2-0-1-0" },

  // Knee Dominant
  { name: "Barbell Back Squat", category: "main_movements", subcategory: "knee_dominant", default_tempo: "3-1-1-0" },
  { name: "Barbell Front Squat", category: "main_movements", subcategory: "knee_dominant", default_tempo: "3-1-1-0" },
  { name: "Goblet Squat", category: "main_movements", subcategory: "knee_dominant", default_tempo: "3-1-1-0" },
  { name: "DB Split Squat", category: "main_movements", subcategory: "knee_dominant", default_each_side: true, default_weight_per_side: true, default_tempo: "3-1-1-0" },
  { name: "Bulgarian Split Squat", category: "main_movements", subcategory: "knee_dominant", default_each_side: true, default_weight_per_side: true, default_tempo: "3-1-1-0" },
  { name: "Leg Press", category: "main_movements", subcategory: "knee_dominant", default_tempo: "3-1-1-0" },
  { name: "Walking Lunge", category: "main_movements", subcategory: "knee_dominant", default_each_side: true, default_weight_per_side: true, default_tempo: "2-0-1-0" },
  { name: "Reverse Lunge", category: "main_movements", subcategory: "knee_dominant", default_each_side: true, default_weight_per_side: true, default_tempo: "2-0-1-0" },
  { name: "Step Up", category: "main_movements", subcategory: "knee_dominant", default_each_side: true, default_weight_per_side: true, default_tempo: "2-0-1-0" },
  { name: "Leg Extension", category: "main_movements", subcategory: "knee_dominant", default_tempo: "2-1-1-1" },
  { name: "Leg Curl", category: "main_movements", subcategory: "knee_dominant", default_tempo: "2-1-1-1" },
  { name: "Hack Squat", category: "main_movements", subcategory: "knee_dominant", default_tempo: "3-1-1-0" },
  { name: "Pistol Squat", category: "main_movements", subcategory: "knee_dominant", default_each_side: true },

  // Horizontal Pull
  { name: "Barbell Bent Over Row", category: "main_movements", subcategory: "horizontal_pull", default_tempo: "2-1-1-0" },
  { name: "DB Row", category: "main_movements", subcategory: "horizontal_pull", default_each_side: true, default_weight_per_side: true, default_tempo: "2-1-1-0" },
  { name: "Cable Row", category: "main_movements", subcategory: "horizontal_pull", default_tempo: "2-1-1-0" },
  { name: "Seated Cable Row", category: "main_movements", subcategory: "horizontal_pull", default_tempo: "2-1-1-0" },
  { name: "T-Bar Row", category: "main_movements", subcategory: "horizontal_pull", default_tempo: "2-1-1-0" },
  { name: "Inverted Row", category: "main_movements", subcategory: "horizontal_pull", default_tempo: "2-1-1-0" },
  { name: "Chest Supported Row", category: "main_movements", subcategory: "horizontal_pull", default_weight_per_side: true, default_tempo: "2-1-1-0" },

  // Vertical Pull
  { name: "Pull Up", category: "main_movements", subcategory: "vertical_pull", default_tempo: "2-0-1-0" },
  { name: "Chin Up", category: "main_movements", subcategory: "vertical_pull", default_tempo: "2-0-1-0" },
  { name: "Lat Pulldown", category: "main_movements", subcategory: "vertical_pull", default_tempo: "2-1-1-0" },
  { name: "Neutral Grip Pulldown", category: "main_movements", subcategory: "vertical_pull", default_tempo: "2-1-1-0" },
  { name: "Assisted Pull Up", category: "main_movements", subcategory: "vertical_pull", default_tempo: "2-0-1-0" },
  { name: "Straight Arm Pulldown", category: "main_movements", subcategory: "vertical_pull", default_tempo: "2-1-1-0" },

  // Horizontal Push
  { name: "Barbell Bench Press", category: "main_movements", subcategory: "horizontal_push", default_tempo: "2-1-1-0" },
  { name: "DB Bench Press", category: "main_movements", subcategory: "horizontal_push", default_weight_per_side: true, default_tempo: "2-1-1-0" },
  { name: "Incline Barbell Bench Press", category: "main_movements", subcategory: "horizontal_push", default_tempo: "2-1-1-0" },
  { name: "Incline DB Press", category: "main_movements", subcategory: "horizontal_push", default_weight_per_side: true, default_tempo: "2-1-1-0" },
  { name: "Push Up", category: "main_movements", subcategory: "horizontal_push", default_tempo: "2-0-1-0" },
  { name: "Cable Chest Press", category: "main_movements", subcategory: "horizontal_push", default_tempo: "2-1-1-0" },
  { name: "Dip", category: "main_movements", subcategory: "horizontal_push", default_tempo: "2-0-1-0" },

  // Vertical Push
  { name: "Barbell Overhead Press", category: "main_movements", subcategory: "vertical_push", default_tempo: "2-0-1-0" },
  { name: "DB Overhead Press", category: "main_movements", subcategory: "vertical_push", default_weight_per_side: true, default_tempo: "2-0-1-0" },
  { name: "Landmine Press", category: "main_movements", subcategory: "vertical_push", default_each_side: true, default_tempo: "2-0-1-0" },
  { name: "Arnold Press", category: "main_movements", subcategory: "vertical_push", default_weight_per_side: true, default_tempo: "2-0-2-0" },
  { name: "Push Press", category: "main_movements", subcategory: "vertical_push", default_tempo: "1-0-X-0" },

  // Full Body
  { name: "Barbell Clean", category: "main_movements", subcategory: "full_body" },
  { name: "DB Snatch", category: "main_movements", subcategory: "full_body", default_each_side: true, default_weight_per_side: true },
  { name: "Turkish Get Up", category: "main_movements", subcategory: "full_body", default_each_side: true, default_weight_per_side: true },
  { name: "Thruster", category: "main_movements", subcategory: "full_body", default_tempo: "2-0-X-0" },
  { name: "Man Maker", category: "main_movements", subcategory: "full_body", default_weight_per_side: true },

  // ── Core ──
  { name: "Pallof Press", category: "core", subcategory: "anti_rotation", default_each_side: true, default_tempo: "2-2-2-0" },
  { name: "Cable Chop", category: "core", subcategory: "anti_rotation", default_each_side: true },
  { name: "Cable Lift", category: "core", subcategory: "anti_rotation", default_each_side: true },
  { name: "Landmine Rotation", category: "core", subcategory: "anti_rotation" },
  { name: "Dead Bug", category: "core", subcategory: "anti_extension", default_tempo: "2-1-2-1" },
  { name: "Ab Wheel Rollout", category: "core", subcategory: "anti_extension", default_tempo: "3-0-3-0" },
  { name: "Plank", category: "core", subcategory: "anti_extension" },
  { name: "Long Lever Plank", category: "core", subcategory: "anti_extension" },
  { name: "Body Saw", category: "core", subcategory: "anti_extension" },
  { name: "Side Plank", category: "core", subcategory: "anti_lateral_flexion", default_each_side: true },
  { name: "Copenhagen Plank", category: "core", subcategory: "anti_lateral_flexion", default_each_side: true },
  { name: "Suitcase Carry", category: "core", subcategory: "anti_lateral_flexion", default_each_side: true, default_weight_per_side: true },
  { name: "Farmer's Carry", category: "core", subcategory: "anti_lateral_flexion", default_weight_per_side: true },
  { name: "Reverse Crunch", category: "core", subcategory: "anti_flexion", default_tempo: "2-1-2-0" },
  { name: "Hanging Leg Raise", category: "core", subcategory: "anti_flexion" },
  { name: "GHD Sit Up", category: "core", subcategory: "anti_flexion" },
  { name: "Bird Dog", category: "core", subcategory: "core_misc", default_each_side: true },
  { name: "Stir The Pot", category: "core", subcategory: "core_misc" },
  { name: "Bear Crawl", category: "core", subcategory: "core_misc" },

  // ── Hypertrophy ──
  { name: "DB Bicep Curl", category: "hypertrophy", subcategory: "arms", default_weight_per_side: true, default_tempo: "2-0-1-1" },
  { name: "Barbell Curl", category: "hypertrophy", subcategory: "arms", default_tempo: "2-0-1-1" },
  { name: "Hammer Curl", category: "hypertrophy", subcategory: "arms", default_weight_per_side: true, default_tempo: "2-0-1-1" },
  { name: "Tricep Pushdown", category: "hypertrophy", subcategory: "arms", default_tempo: "2-0-1-1" },
  { name: "Skull Crusher", category: "hypertrophy", subcategory: "arms", default_tempo: "2-1-1-0" },
  { name: "Overhead Tricep Extension", category: "hypertrophy", subcategory: "arms", default_tempo: "2-1-1-0" },
  { name: "Cable Fly", category: "hypertrophy", subcategory: "pecs", default_tempo: "2-1-1-1" },
  { name: "DB Fly", category: "hypertrophy", subcategory: "pecs", default_weight_per_side: true, default_tempo: "2-1-1-1" },
  { name: "Pec Deck", category: "hypertrophy", subcategory: "pecs", default_tempo: "2-1-1-1" },
  { name: "DB Lateral Raise", category: "hypertrophy", subcategory: "shoulders", default_weight_per_side: true, default_tempo: "2-0-1-1" },
  { name: "Cable Lateral Raise", category: "hypertrophy", subcategory: "shoulders", default_each_side: true, default_tempo: "2-0-1-1" },
  { name: "Face Pull", category: "hypertrophy", subcategory: "shoulders", default_tempo: "2-1-1-0" },
  { name: "Reverse Fly", category: "hypertrophy", subcategory: "shoulders", default_weight_per_side: true, default_tempo: "2-1-1-1" },
  { name: "Rear Delt Row", category: "hypertrophy", subcategory: "shoulders", default_tempo: "2-1-1-0" },
  { name: "Calf Raise", category: "hypertrophy", subcategory: "legs", default_tempo: "2-2-1-1" },
  { name: "Seated Calf Raise", category: "hypertrophy", subcategory: "legs", default_tempo: "2-2-1-1" },
  { name: "Leg Curl Machine", category: "hypertrophy", subcategory: "legs", default_tempo: "2-1-1-1" },
  { name: "Hip Adduction", category: "hypertrophy", subcategory: "legs", default_tempo: "2-1-1-1" },
  { name: "Hip Abduction", category: "hypertrophy", subcategory: "legs", default_tempo: "2-1-1-1" },
  { name: "Cable Crunch", category: "hypertrophy", subcategory: "abs", default_tempo: "2-1-1-1" },
  { name: "Weighted Sit Up", category: "hypertrophy", subcategory: "abs", default_tempo: "2-0-1-0" },
  { name: "Lat Pullover", category: "hypertrophy", subcategory: "back", default_tempo: "2-1-1-1" },
  { name: "Shrug", category: "hypertrophy", subcategory: "back", default_tempo: "2-1-1-1" },

  // ── RFD (Rate of Force Development) ──
  { name: "Power Clean", category: "rfd", subcategory: "olympic_variations" },
  { name: "Hang Clean", category: "rfd", subcategory: "olympic_variations" },
  { name: "Power Snatch", category: "rfd", subcategory: "olympic_variations" },
  { name: "Hang Snatch", category: "rfd", subcategory: "olympic_variations" },
  { name: "Clean & Jerk", category: "rfd", subcategory: "olympic_variations" },
  { name: "Clean Pull", category: "rfd", subcategory: "olympic_variations" },
  { name: "Countermovement Jump (CMJ)", category: "rfd", subcategory: "jumps" },
  { name: "Squat Jump", category: "rfd", subcategory: "jumps" },
  { name: "Box Jump", category: "rfd", subcategory: "jumps" },
  { name: "Depth Jump", category: "rfd", subcategory: "jumps" },
  { name: "Broad Jump", category: "rfd", subcategory: "jumps" },
  { name: "Single Leg Box Jump", category: "rfd", subcategory: "jumps", default_each_side: true },
  { name: "Lateral Bound", category: "rfd", subcategory: "bounds", default_each_side: true },
  { name: "Alternate Leg Bound", category: "rfd", subcategory: "bounds" },
  { name: "Single Leg Hop", category: "rfd", subcategory: "hops", default_each_side: true },
  { name: "Pogo Hop", category: "rfd", subcategory: "hops" },
  { name: "Ankle Hop", category: "rfd", subcategory: "hops" },
  { name: "Sprint", category: "rfd", subcategory: "speed" },
  { name: "Flying Sprint", category: "rfd", subcategory: "speed" },
  { name: "Resisted Sprint", category: "rfd", subcategory: "speed" },
  { name: "Hill Sprint", category: "rfd", subcategory: "speed" },
  { name: "A-Skip", category: "rfd", subcategory: "speed" },
  { name: "Medicine Ball Slam", category: "rfd", subcategory: "misc_rfd" },
  { name: "Medicine Ball Chest Pass", category: "rfd", subcategory: "misc_rfd" },
  { name: "Medicine Ball Rotational Throw", category: "rfd", subcategory: "misc_rfd", default_each_side: true },
  { name: "Plyo Push Up", category: "rfd", subcategory: "upper_body_plyometrics" },
  { name: "Medicine Ball Overhead Throw", category: "rfd", subcategory: "upper_body_plyometrics" },

  // ── Mobility / Activation ──
  { name: "T-Spine Rotation", category: "mobility_activation", subcategory: "t_spine", default_each_side: true },
  { name: "Cat-Cow", category: "mobility_activation", subcategory: "t_spine" },
  { name: "Open Book", category: "mobility_activation", subcategory: "t_spine", default_each_side: true },
  { name: "Foam Roll T-Spine Extension", category: "mobility_activation", subcategory: "t_spine" },
  { name: "Shoulder CARs", category: "mobility_activation", subcategory: "shoulder", default_each_side: true },
  { name: "Band Pull Apart", category: "mobility_activation", subcategory: "shoulder" },
  { name: "Shoulder Dislocate", category: "mobility_activation", subcategory: "shoulder" },
  { name: "Wall Slide", category: "mobility_activation", subcategory: "shoulder" },
  { name: "Ankle CARs", category: "mobility_activation", subcategory: "ankle", default_each_side: true },
  { name: "Wall Ankle Mobilization", category: "mobility_activation", subcategory: "ankle", default_each_side: true },
  { name: "90/90 Hip Stretch", category: "mobility_activation", subcategory: "hip", default_each_side: true },
  { name: "Hip CARs", category: "mobility_activation", subcategory: "hip", default_each_side: true },
  { name: "Hip Flexor Stretch", category: "mobility_activation", subcategory: "hip", default_each_side: true },
  { name: "Pigeon Stretch", category: "mobility_activation", subcategory: "hip", default_each_side: true },
  { name: "Adductor Rock Back", category: "mobility_activation", subcategory: "hip" },
  { name: "World's Greatest Stretch", category: "mobility_activation", subcategory: "mobility_misc", default_each_side: true },
  { name: "Inchworm", category: "mobility_activation", subcategory: "mobility_misc" },
  { name: "Banded Knee Valgus Correction", category: "mobility_activation", subcategory: "knee" },
  { name: "Terminal Knee Extension", category: "mobility_activation", subcategory: "knee" },
  { name: "Scapular Push Up", category: "mobility_activation", subcategory: "shoulder_blades" },
  { name: "Prone Y-T-W Raise", category: "mobility_activation", subcategory: "shoulder_blades" },
  { name: "Serratus Wall Slide", category: "mobility_activation", subcategory: "shoulder_blades" },
];

async function seed() {
  console.log(`Seeding ${EXERCISES.length} exercises...`);

  // Batch insert with upsert on name
  const BATCH_SIZE = 50;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < EXERCISES.length; i += BATCH_SIZE) {
    const batch = EXERCISES.slice(i, i + BATCH_SIZE).map(ex => ({
      name: ex.name,
      category: ex.category,
      subcategory: ex.subcategory,
      video_url: ex.video_url || null,
      description: ex.description || null,
      default_weight_per_side: ex.default_weight_per_side || false,
      default_each_side: ex.default_each_side || false,
      default_tempo: ex.default_tempo || null
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/exercises`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates"
      },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Batch ${i}–${i + batch.length} failed: ${res.status}`, text);
      skipped += batch.length;
    } else {
      const data = await res.json();
      inserted += data.length;
      console.log(`  Batch ${i + 1}–${i + batch.length}: ${data.length} upserted`);
    }
  }

  console.log(`Done. Inserted/updated: ${inserted}, Failed: ${skipped}`);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
