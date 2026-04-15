import fs from "node:fs";
import path from "node:path";
import process from "node:process";

loadDotEnvFromWorkspace();

const { getConfig } = await import("../netlify/functions/_lib/config.js");
const {
  listRunningWorkoutTemplates,
  listRunningWorkoutTemplateSteps,
  deleteRunningWorkoutTemplateSteps,
  upsertRunningWorkoutTemplateSteps,
} = await import("../netlify/functions/_lib/supabase.js");

const STEP_MAP = {
  "LHR+": [
    makeStep("warmup", "pace", "easy", 10, "Aquecimento fácil"),
    makeStep("steady", "pace", "easy", 70, "Bloco aeróbio controlado"),
    makeStep("steady", "pace", "threshold", 20, "Fecho em limiar"),
  ],
  "Easy": [
    makeStep("warmup", "pace", "easy", 10, "Aquecimento fácil"),
    makeStep("steady", "pace", "recovery", 80, "Rodagem fácil e estável"),
    makeStep("cooldown", "pace", "easy", 10, "Retorno à calma"),
  ],
  "Tempo Run": [
    makeStep("warmup", "pace", "easy", 15, "Aquecimento progressivo"),
    makeStep("steady", "pace", "threshold", 70, "Bloco tempo em limiar"),
    makeStep("cooldown", "pace", "recovery", 15, "Retorno à calma"),
  ],
  "Interval": [
    makeStep("warmup", "pace", "easy", 15, "Aquecimento progressivo"),
    makeStep("interval", "pace", "interval", 55, "Repetições em VO2max"),
    makeStep("recovery", "pace", "recovery", 15, "Recuperação ativa"),
    makeStep("cooldown", "pace", "recovery", 15, "Retorno à calma"),
  ],
  "Repetition": [
    makeStep("warmup", "pace", "easy", 15, "Aquecimento progressivo"),
    makeStep("interval", "pace", "repetition", 55, "Repetições de velocidade"),
    makeStep("recovery", "pace", "recovery", 15, "Recuperação ativa"),
    makeStep("cooldown", "pace", "recovery", 15, "Retorno à calma"),
  ],
  "Interval Combo": [
    makeStep("warmup", "pace", "easy", 10, "Aquecimento"),
    makeStep("interval", "pace", "repetition", 35, "Bloco de repetições"),
    makeStep("recovery", "pace", "recovery", 10, "Recuperação ativa"),
    makeStep("interval", "pace", "interval", 35, "Bloco intervalado"),
    makeStep("cooldown", "pace", "recovery", 10, "Retorno à calma"),
  ],
  "Long Run": [
    makeStep("warmup", "pace", "easy", 5, "Aquecimento leve"),
    makeStep("steady", "pace", "marathon", 85, "Bloco longo contínuo"),
    makeStep("cooldown", "pace", "recovery", 10, "Retorno à calma"),
  ],
  "Long Tempo": [
    makeStep("warmup", "pace", "easy", 10, "Aquecimento progressivo"),
    makeStep("steady", "pace", "threshold", 75, "Bloco tempo longo"),
    makeStep("cooldown", "pace", "recovery", 15, "Retorno à calma"),
  ],
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

async function main() {
  const config = getConfig();
  const templates = await listRunningWorkoutTemplates(config, {});
  const aerTemplates = templates.filter((t) => String(t.name || "").startsWith("AER Legacy - "));

  if (!aerTemplates.length) {
    console.log("No AER Legacy workout templates found.");
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const template of aerTemplates) {
    const shortName = String(template.name || "").replace("AER Legacy - ", "").trim();
    const stepBlueprint = STEP_MAP[shortName];

    if (!stepBlueprint) {
      skipped += 1;
      console.log(`SKIP ${template.name}: no step blueprint`);
      continue;
    }

    const existing = await listRunningWorkoutTemplateSteps(config, template.id);
    const payload = stepBlueprint.map((step, idx) => ({
      workout_template_id: template.id,
      step_order: idx + 1,
      step_type: step.step_type,
      target_type: step.target_type,
      duration_seconds: null,
      distance_meters: null,
      repeat_count: null,
      target_min: null,
      target_max: null,
      target_unit: null,
      prescription_payload: step.prescription_payload,
      instruction_text: step.instruction_text,
      export_hint: step.export_hint,
    }));

    await deleteRunningWorkoutTemplateSteps(config, template.id);
    await upsertRunningWorkoutTemplateSteps(config, payload);

    updated += 1;
    console.log(`OK ${template.name}: ${existing.length} -> ${payload.length} steps`);
  }

  console.log(`Done. templates=${aerTemplates.length}, updated=${updated}, skipped=${skipped}`);
}

function makeStep(stepType, targetType, ref, pct, instruction) {
  return {
    step_type: stepType,
    target_type: targetType,
    prescription_payload: targetType === "pace"
      ? {
          mode: "vdot_reference",
          ref,
          offset_sec_per_km: 0,
          range_sec: 0,
        }
      : {},
    instruction_text: instruction,
    export_hint: {
      step_volume_pct: pct,
      volume_mode: "automatic",
    },
  };
}

function loadDotEnvFromWorkspace() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
