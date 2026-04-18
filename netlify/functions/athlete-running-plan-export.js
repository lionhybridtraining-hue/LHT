const AdmZip = require("adm-zip");
const { getConfig } = require("./_lib/config");
const { json } = require("./_lib/http");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getOnboardingIntakeByIdentity } = require("./_lib/supabase");

let fitSdkPromise = null;

const SECTION_LABEL_MAP = {
  warmup: "Warmup",
  aquecimento: "Warmup",
  sets: "Main",
  series: "Main",
  sries: "Main",
  main: "Main",
  rest: "Recover",
  recover: "Recover",
  recovery: "Recover",
  recuperacao: "Recover",
  "recuperação": "Recover",
  cooldown: "Cooldown",
  arrefecimento: "Cooldown",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const format = String(event.queryStringParameters?.format || "fit").trim().toLowerCase();
    if (format !== "fit" && format !== "tcx") {
      return json(400, {
        error: "Unsupported export format.",
        supported_formats: ["fit", "tcx"],
      });
    }

    const onboardingIntake = await getOnboardingIntakeByIdentity(config, auth.user.sub);
    const exportModel = buildOnboardingExportModel(onboardingIntake);
    if (!exportModel) {
      return json(404, { error: "No free running plan found for this athlete." });
    }

    const zip = new AdmZip();
    for (const workout of exportModel.workouts) {
      const zipPath = buildExportZipPath(workout, format);
      if (format === "fit") {
        zip.addFile(zipPath, await renderFitWorkout(workout, exportModel));
      } else {
        zip.addFile(zipPath, Buffer.from(renderTcxWorkout(workout, exportModel), "utf8"));
      }
    }

    zip.addFile("manifest.csv", Buffer.from(renderManifestCsv(exportModel, format), "utf8"));
    zip.addFile("README.txt", Buffer.from(renderReadme(exportModel, format), "utf8"));

    const fileDate = new Date().toISOString().slice(0, 10);
    const filename = `lht-running-plan-${format}-${fileDate}.zip`;

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
      body: zip.toBuffer().toString("base64"),
    };
  } catch (error) {
    console.error("[athlete-running-plan-export]", error);
    return json(500, { error: error.message || "Internal server error" });
  }
};

function buildOnboardingExportModel(onboardingIntake) {
  const answers = onboardingIntake && onboardingIntake.answers && typeof onboardingIntake.answers === "object"
    ? onboardingIntake.answers
    : null;
  const payload = answers && answers.plan_generation && typeof answers.plan_generation === "object"
    ? answers.plan_generation
    : null;
  const planData = payload && payload.plan_data && typeof payload.plan_data === "object"
    ? payload.plan_data
    : null;
  const planParams = payload && payload.plan_params && typeof payload.plan_params === "object"
    ? payload.plan_params
    : {};

  if (!planData) return null;

  const workouts = [];
  const phaseOrder = ["phase1", "phase2", "phase3"];
  phaseOrder.forEach((phaseKey, phaseIndex) => {
    const phaseWeeks = planData[phaseKey];
    if (!phaseWeeks || typeof phaseWeeks !== "object") return;

    const weekEntries = Object.entries(phaseWeeks).sort((left, right) => Number(left[0]) - Number(right[0]));
    weekEntries.forEach(([weekKey, sessions]) => {
      if (!Array.isArray(sessions)) return;

      sessions.forEach((session, workoutIndex) => {
        const normalized = normalizeWorkout(session, {
          phaseKey,
          phaseNumber: phaseIndex + 1,
          weekNumber: Number(weekKey) + 1,
          workoutNumber: workoutIndex + 1,
        });
        workouts.push(normalized);
      });
    });
  });

  if (!workouts.length) return null;

  const athleteName = firstNonEmptyString(
    planParams.athlete_name,
    onboardingIntake && onboardingIntake.full_name,
    onboardingIntake && onboardingIntake.email,
    "LHT Athlete"
  );

  return {
    athleteName,
    planParams,
    generatedAt: payload.saved_at || onboardingIntake.plan_generated_at || null,
    workouts,
  };
}

function normalizeWorkout(session, meta) {
  const title = firstNonEmptyString(session && session.training_title_pt, session && session.training_title_en, `Treino ${meta.workoutNumber}`);
  const description = firstNonEmptyString(session && session.training_description_pt, session && session.training_description_en, "");
  const splitString = String(session && session.split_string ? session.split_string : "").trim();
  const totalDistanceKm = toFiniteNumber(session && session.total_training_distance, 0);
  const splitPayload = splitHumanAndCompact(splitString);
  const compactSegments = parseCompactSegments(splitPayload.compact);
  const steps = buildWorkoutSteps(splitPayload, compactSegments, totalDistanceKm);
  const baseFilename = slugify(`${meta.phaseKey}-week-${String(meta.weekNumber).padStart(2, "0")}-${String(meta.workoutNumber).padStart(2, "0")}-${title}`) || `workout-${meta.phaseNumber}-${meta.weekNumber}-${meta.workoutNumber}`;

  return {
    ...meta,
    title,
    description,
    splitString,
    totalDistanceKm,
    steps,
    baseFilename,
    baseZipPath: `${meta.phaseKey}/week-${String(meta.weekNumber).padStart(2, "0")}/${baseFilename}`,
  };
}

function splitHumanAndCompact(input) {
  const cleanedInput = String(input || "").trim();
  const compactPayloadAfterParen = /\)\s*[,;:]?\s*(?=\d+(?:\.\d+)?km-\d{1,2}:\d{2}(?:min)?)/i;
  const compactPayloadMatch = compactPayloadAfterParen.exec(cleanedInput);

  if (compactPayloadMatch) {
    const compactStart = compactPayloadMatch.index + compactPayloadMatch[0].length;
    return {
      human: cleanedInput.slice(0, compactPayloadMatch.index + 1).trim(),
      compact: cleanedInput.slice(compactStart).trim(),
    };
  }

  const trailingCompactPayload = /\d+(?:\.\d+)?km-\d{1,2}:\d{2}(?:min)?(?:\+\d+(?:\.\d+)?km-\d{1,2}:\d{2}(?:min)?)+\s*$/i;
  const trailingMatch = trailingCompactPayload.exec(cleanedInput);
  if (trailingMatch) {
    return {
      human: cleanedInput.slice(0, trailingMatch.index).trim(),
      compact: trailingMatch[0].trim(),
    };
  }

  return {
    human: cleanedInput,
    compact: "",
  };
}

function parseCompactSegments(compact) {
  const pattern = /(\d+(?:\.\d+)?)km-(\d{1,2}:\d{2}(?:min)?)/gi;
  const segments = [];
  let match;
  while ((match = pattern.exec(compact)) !== null) {
    const distanceKm = Number.parseFloat(match[1]);
    const paceSeconds = paceToSeconds(match[2]);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(paceSeconds) || paceSeconds <= 0) {
      continue;
    }
    segments.push({
      distanceKm,
      paceSeconds,
      paceLabel: formatPace(paceSeconds),
    });
  }
  return segments;
}

function buildWorkoutSteps(splitPayload, compactSegments, totalDistanceKm) {
  const sectionLabels = extractSectionLabels(splitPayload.human);
  const steps = compactSegments.length
    ? compactSegments.map((segment, index) => {
        const sectionLabel = sectionLabels.length
          ? sectionLabels[Math.min(sectionLabels.length - 1, Math.floor((index * sectionLabels.length) / compactSegments.length))]
          : defaultStepLabel(index, compactSegments.length);
        return createSegmentStep(segment, sectionLabel, index + 1);
      })
    : [];

  if (!steps.length && totalDistanceKm > 0) {
    return [createFallbackStep(totalDistanceKm, splitPayload.human || "Treino contínuo")];
  }

  if (!steps.length) {
    return [createOpenStep(splitPayload.human || "Consultar descrição do treino")];
  }

  if (steps.length <= 20) {
    return steps.map((step, index) => ({ ...step, stepId: index + 1 }));
  }

  const chunkSize = Math.ceil(steps.length / 20);
  const condensed = [];
  for (let index = 0; index < steps.length; index += chunkSize) {
    const slice = steps.slice(index, index + chunkSize);
    condensed.push(mergeSteps(slice));
  }
  return condensed.slice(0, 20).map((step, index) => ({ ...step, stepId: index + 1 }));
}

function extractSectionLabels(humanText) {
  if (!humanText) return [];
  return humanText
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const labeledChunkMatch = chunk.match(/^([A-Za-zÀ-ÿ ]{3,}):\s*(.+)$/);
      if (!labeledChunkMatch) return null;
      const normalized = stripAccents(labeledChunkMatch[1]).toLowerCase().trim();
      return SECTION_LABEL_MAP[normalized] || labeledChunkMatch[1].trim();
    })
    .filter(Boolean);
}

function createSegmentStep(segment, sectionLabel, stepNumber) {
  const speed = 1000 / segment.paceSeconds;
  const lowSpeed = Math.max(0.2, speed * 0.97);
  const highSpeed = Math.max(lowSpeed + 0.01, speed * 1.03);
  const intensity = resolveFitIntensity(sectionLabel);

  return {
    stepId: stepNumber,
    name: toFitString(`${sectionLabel} ${stepNumber}`, `Step ${stepNumber}`),
    intensity,
    durationType: "distance",
    durationValue: Math.max(1, Math.round(segment.distanceKm * 1000 * 100)),
    meters: clampUnsignedShort(Math.round(segment.distanceKm * 1000)),
    targetType: "speed",
    targetValue: 0,
    customTargetValueLow: Math.max(1, Math.round(lowSpeed * 1000)),
    customTargetValueHigh: Math.max(1, Math.round(highSpeed * 1000)),
    target: {
      viewAs: "Pace",
      lowInMetersPerSecond: round3(lowSpeed),
      highInMetersPerSecond: round3(highSpeed),
    },
    notes: `${segment.distanceKm.toFixed(2)} km @ ${segment.paceLabel}/km`,
  };
}

function createFallbackStep(totalDistanceKm, note) {
  return {
    stepId: 1,
    name: toFitString("Main Run", "Main Run"),
    intensity: "active",
    durationType: "distance",
    durationValue: Math.max(1, Math.round(totalDistanceKm * 1000 * 100)),
    meters: clampUnsignedShort(Math.round(totalDistanceKm * 1000)),
    targetType: "open",
    targetValue: 0,
    target: null,
    notes: note,
  };
}

function createOpenStep(note) {
  return {
    stepId: 1,
    name: toFitString("Open Step", "Open Step"),
    intensity: "active",
    durationType: "time",
    durationValue: 60 * 1000,
    seconds: 60,
    targetType: "open",
    targetValue: 0,
    target: null,
    notes: note,
  };
}

function mergeSteps(steps) {
  const merged = steps.reduce((acc, step) => {
    acc.meters += step.meters || 0;
    acc.lowSpeed += step.target && step.target.lowInMetersPerSecond ? step.target.lowInMetersPerSecond : 0;
    acc.highSpeed += step.target && step.target.highInMetersPerSecond ? step.target.highInMetersPerSecond : 0;
    if (step.intensity === "Active") acc.hasActive = true;
    acc.notes.push(step.notes);
    return acc;
  }, { meters: 0, lowSpeed: 0, highSpeed: 0, hasActive: false, notes: [] });

  const count = Math.max(steps.length, 1);
  return {
    stepId: 1,
    name: toFitString(steps[0].name || "Step", "Step"),
    intensity: merged.hasActive ? "active" : "recovery",
    durationType: "distance",
    durationValue: Math.max(1, Math.round(merged.meters * 100)),
    meters: clampUnsignedShort(merged.meters),
    targetType: "speed",
    targetValue: 0,
    customTargetValueLow: Math.max(1, Math.round((merged.lowSpeed / count || 0.3) * 1000)),
    customTargetValueHigh: Math.max(1, Math.round((merged.highSpeed / count || 0.4) * 1000)),
    target: {
      viewAs: "Pace",
      lowInMetersPerSecond: round3(merged.lowSpeed / count || 0.3),
      highInMetersPerSecond: round3(merged.highSpeed / count || 0.4),
    },
    notes: merged.notes.join(" | "),
  };
}

function renderTcxWorkout(workout, exportModel) {
  const notes = [
    workout.description,
    workout.splitString,
  ].filter(Boolean).join(" | ");
  const creatorName = xmlEscape("LHT Export");
  const workoutName = xmlEscape(toRestrictedToken(workout.title, "LHT Run"));
  const creator = [
    "<Creator xsi:type=\"Application_t\">",
    `<Name>${creatorName}</Name>`,
    "<Build><Version><VersionMajor>1</VersionMajor><VersionMinor>0</VersionMinor><BuildMajor>0</BuildMajor><BuildMinor>0</BuildMinor></Version><Type>Release</Type></Build>",
    "<LangID>EN</LangID>",
    "<PartNumber>000-00000-00</PartNumber>",
    "</Creator>",
  ].join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">',
    "<Workouts>",
    '<Workout Sport="Running">',
    `<Name>${workoutName}</Name>`,
    workout.steps.map(renderTcxStep).join(""),
    notes ? `<Notes>${xmlEscape(notes)}</Notes>` : "",
    creator,
    "</Workout>",
    "</Workouts>",
    exportModel.generatedAt ? `<Author xsi:type="Application_t"><Name>${creatorName}</Name><Build><Version><VersionMajor>1</VersionMajor><VersionMinor>0</VersionMinor><BuildMajor>0</BuildMajor><BuildMinor>0</BuildMinor></Version><Type>Release</Type></Build><LangID>EN</LangID><PartNumber>000-00000-00</PartNumber></Author>` : "",
    "</TrainingCenterDatabase>",
  ].join("");
}

function renderTcxStep(step) {
  const durationXml = step.durationType === "time"
    ? `<Duration xsi:type="Time_t"><Seconds>${clampUnsignedShort(step.seconds || 60)}</Seconds></Duration>`
    : `<Duration xsi:type="Distance_t"><Meters>${clampUnsignedShort(step.meters || 1000)}</Meters></Duration>`;

  let targetXml = '<Target xsi:type="None_t" />';
  if (step.targetType === "speed" && step.target) {
    targetXml = [
      '<Target xsi:type="Speed_t">',
      '<SpeedZone xsi:type="CustomSpeedZone_t">',
      `<ViewAs>${step.target.viewAs}</ViewAs>`,
      `<LowInMetersPerSecond>${step.target.lowInMetersPerSecond}</LowInMetersPerSecond>`,
      `<HighInMetersPerSecond>${step.target.highInMetersPerSecond}</HighInMetersPerSecond>`,
      '</SpeedZone>',
      '</Target>',
    ].join("");
  }

  return [
    '<Step xsi:type="Step_t">',
    `<StepId>${step.stepId}</StepId>`,
    `<Name>${xmlEscape(toRestrictedToken(step.name, `Step ${step.stepId}`))}</Name>`,
    durationXml,
    `<Intensity>${fitIntensityToTcxIntensity(step.intensity)}</Intensity>`,
    targetXml,
    step.notes ? `<Notes>${xmlEscape(step.notes)}</Notes>` : "",
    '</Step>',
  ].join("");
}

async function renderFitWorkout(workout, exportModel) {
  const { Encoder } = await loadFitSdk();
  const encoder = new Encoder();
  const generatedAt = exportModel.generatedAt ? new Date(exportModel.generatedAt) : new Date();
  const workoutNumber = (workout.phaseNumber * 1000) + (workout.weekNumber * 10) + workout.workoutNumber;
  const notes = [workout.description, workout.splitString].filter(Boolean).join(" | ");

  encoder.writeMesg({
    mesgNum: 0,
    type: "workout",
    manufacturer: "development",
    product: 0,
    serialNumber: 1,
    timeCreated: generatedAt,
    number: workoutNumber,
  });

  encoder.writeMesg({
    mesgNum: 26,
    sport: "running",
    subSport: "generic",
    capabilities: 0x20 | 0x80 | 0x200,
    numValidSteps: workout.steps.length,
    wktName: toFitString(workout.title, "LHT Run"),
    wktDescription: toFitString(notes, workout.title),
  });

  encoder.writeMesg({
    mesgNum: 158,
    messageIndex: 0,
    sport: "running",
    subSport: "generic",
    numValidSteps: workout.steps.length,
    firstStepIndex: 0,
  });

  workout.steps.forEach((step, index) => {
    const mesg = {
      mesgNum: 27,
      messageIndex: index,
      wktStepName: toFitString(step.name, `Step ${index + 1}`),
      durationType: step.durationType,
      durationValue: step.durationValue,
      targetType: step.targetType,
      targetValue: step.targetValue,
      intensity: step.intensity,
    };

    if (step.customTargetValueLow != null) {
      mesg.customTargetValueLow = step.customTargetValueLow;
    }
    if (step.customTargetValueHigh != null) {
      mesg.customTargetValueHigh = step.customTargetValueHigh;
    }
    if (step.notes) {
      mesg.notes = toFitString(step.notes, "");
    }

    encoder.writeMesg(mesg);
  });

  return Buffer.from(encoder.close());
}

function renderManifestCsv(exportModel, format) {
  const header = [
    "filename",
    "phase",
    "week",
    "workout_number",
    "title",
    "distance_km",
    "description",
    "split_string",
  ];

  const rows = exportModel.workouts.map((workout) => [
    buildExportZipPath(workout, format),
    workout.phaseKey,
    workout.weekNumber,
    workout.workoutNumber,
    workout.title,
    workout.totalDistanceKm,
    workout.description,
    workout.splitString,
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

function renderReadme(exportModel, format) {
  const upperFormat = format.toUpperCase();
  return [
    `LHT running plan export for ${exportModel.athleteName}`,
    "",
    "Contents:",
    `- One ${upperFormat} workout per planned run.`,
    "- manifest.csv with phase/week/workout mapping.",
    "",
    "Import guidance:",
    format === "fit"
      ? "- FIT is the structured workout format used by Garmin and other device workflows for this export."
      : "- TCX is kept as a fallback export for platforms that still accept workout XML files.",
    format === "fit"
      ? "- TrainingPeaks file upload is aimed at completed activities; planned structured workouts generally need to be created inside TrainingPeaks or sent through an integration."
      : "- TrainingPeaks does not reliably import planned structured workouts through manual file upload.",
    "- If a platform refuses the ZIP, import individual workout files instead.",
    format === "tcx"
      ? "- Workout names in TCX are truncated to 15 characters because Garmin TCX requires restricted tokens."
      : "- FIT workout names and notes are normalized to ASCII-safe strings for broader device compatibility.",
    "",
    "Plan parameters:",
    `- Distance target: ${firstNonEmptyString(exportModel.planParams.program_distance, "n/a")} km`,
    `- Weekly frequency: ${firstNonEmptyString(exportModel.planParams.training_frequency, "n/a")}`,
    `- Progression rate: ${firstNonEmptyString(exportModel.planParams.progression_rate, "n/a")}`,
  ].join("\n");
}

function defaultStepLabel(index, total) {
  if (index === 0) return "Warmup";
  if (index === total - 1) return "Cooldown";
  return "Main";
}

function resolveFitIntensity(sectionLabel) {
  const normalized = stripAccents(String(sectionLabel || "")).toLowerCase();
  if (normalized.includes("warm")) return "warmup";
  if (normalized.includes("cool")) return "cooldown";
  if (normalized.includes("recover") || normalized.includes("rest")) return "recovery";
  return "active";
}

function fitIntensityToTcxIntensity(intensity) {
  return intensity === "recovery" || intensity === "rest" ? "Resting" : "Active";
}

function paceToSeconds(value) {
  const normalized = String(value || "").trim().replace(/min$/i, "");
  const parts = normalized.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return Number.NaN;
  return parts[0] * 60 + parts[1];
}

function formatPace(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function toRestrictedToken(value, fallback) {
  const normalized = stripAccents(String(value || fallback || "Step"))
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || fallback || "Step").slice(0, 15);
}

function toFitString(value, fallback) {
  return stripAccents(String(value || fallback || ""))
    .replace(/[^A-Za-z0-9 .,;:()\-+/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function buildExportZipPath(workout, format) {
  return `${workout.baseZipPath}.${format}`;
}

async function loadFitSdk() {
  if (!fitSdkPromise) {
    fitSdkPromise = import("@garmin/fitsdk");
  }
  return fitSdkPromise;
}

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function csvEscape(value) {
  const stringValue = String(value == null ? "" : value);
  if (!/[",\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function clampUnsignedShort(value) {
  const numeric = Math.round(Number(value) || 0);
  return Math.min(65535, Math.max(0, numeric));
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}