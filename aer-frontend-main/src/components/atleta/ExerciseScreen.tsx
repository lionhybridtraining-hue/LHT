import { useState, useRef, useEffect } from "react";
import type { Prescription, WorkoutStep } from "@/types/strength";
import { formatPrescription } from "@/lib/workout-engine";

interface Props {
  step: WorkoutStep;
  previousLoad?: number | null;
  onSubmitSet: (data: SetData) => void;
}

export interface SetData {
  planExerciseId: string;
  setNumber: number;
  reps: number;
  loadKg: number | null;
  rir: number | null;
  durationSeconds: number | null;
}

export default function ExerciseScreen({
  step,
  previousLoad,
  onSubmitSet,
}: Props) {
  const rx = step.prescription!;
  const exercise = step.exercise!;
  const detail = exercise.exercise;

  // Determine initial load: from prescription or previous log
  const defaultLoad = rx.loadKg ?? previousLoad ?? null;
  const defaultReps =
    rx.reps_min && rx.reps_max
      ? Math.round((rx.reps_min + rx.reps_max) / 2)
      : rx.reps ?? 0;

  const [loadKg, setLoadKg] = useState<string>(
    defaultLoad != null ? String(defaultLoad) : ""
  );
  const [reps, setReps] = useState<string>(String(defaultReps));
  const [rir, setRir] = useState<string>(rx.rir != null ? String(rx.rir) : "");
  const [duration, setDuration] = useState<string>(
    rx.duration_seconds ? String(rx.duration_seconds) : ""
  );

  const loadRef = useRef<HTMLInputElement>(null);

  // Reset form when step changes
  useEffect(() => {
    const newLoad = rx.loadKg ?? previousLoad ?? null;
    setLoadKg(newLoad != null ? String(newLoad) : "");
    setReps(
      String(
        rx.reps_min && rx.reps_max
          ? Math.round((rx.reps_min + rx.reps_max) / 2)
          : rx.reps ?? 0
      )
    );
    setRir(rx.rir != null ? String(rx.rir) : "");
    setDuration(rx.duration_seconds ? String(rx.duration_seconds) : "");
  }, [step.planExerciseId, step.setNumber, rx, previousLoad]);

  const handleSubmit = () => {
    onSubmitSet({
      planExerciseId: step.planExerciseId!,
      setNumber: step.setNumber!,
      reps: parseInt(reps) || 0,
      loadKg: loadKg ? parseFloat(loadKg) : null,
      rir: rir !== "" ? parseInt(rir) : null,
      durationSeconds: duration ? parseInt(duration) : null,
    });
  };

  const isDuration = rx.prescription_type === "duration";
  const showRir = rx.rir != null;
  const prescriptionText = formatPrescription(rx);

  return (
    <div className="flex h-full flex-col px-5 pb-8 pt-4">
      {/* Exercise info header */}
      <div className="mb-6 text-center">
        <h2 className="font-['Oswald'] text-xl font-bold text-white">
          {detail.name}
        </h2>
        <p className="mt-1 text-xs text-white/50">{prescriptionText}</p>

        {/* Tags */}
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {exercise.superset_group && (
            <span className="rounded-full bg-orange-600/20 px-2.5 py-0.5 text-[10px] font-semibold text-orange-400">
              Superset {exercise.superset_group}
            </span>
          )}
          {exercise.each_side && (
            <span className="rounded-full bg-blue-600/20 px-2.5 py-0.5 text-[10px] font-semibold text-blue-400">
              Cada lado
            </span>
          )}
          {rx.method && rx.method !== "standard" && (
            <span className="rounded-full bg-purple-600/20 px-2.5 py-0.5 text-[10px] font-semibold text-purple-400">
              {rx.method.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Tempo */}
        {rx.tempo && (
          <p className="mt-2 font-mono text-lg tracking-widest text-orange-300/80">
            {rx.tempo}
          </p>
        )}

        {/* Coach notes */}
        {rx.coach_notes && (
          <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-white/60">
            {rx.coach_notes}
          </div>
        )}
      </div>

      {/* Video link */}
      {detail.video_url && (
        <a
          href={detail.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm text-orange-400 active:bg-white/10"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Ver vídeo
        </a>
      )}

      {/* Spacer to push inputs to bottom-center area */}
      <div className="flex-1" />

      {/* Input section */}
      <div className="space-y-4">
        {/* Set indicator */}
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Set {step.setNumber}/{step.totalSets}
          </span>
        </div>

        {isDuration ? (
          /* Duration input */
          <InputField
            label="Duração (s)"
            value={duration}
            onChange={setDuration}
            type="number"
            inputMode="numeric"
          />
        ) : (
          /* Reps + Load */
          <>
            {/* Load — big central input */}
            <div className="text-center">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">
                Carga (kg)
              </label>
              <input
                ref={loadRef}
                type="number"
                inputMode="decimal"
                step="0.5"
                value={loadKg}
                onChange={(e) => setLoadKg(e.target.value)}
                placeholder="—"
                className="w-32 border-b-2 border-orange-500/50 bg-transparent text-center font-['Oswald'] text-5xl font-bold text-white outline-none placeholder:text-white/20 focus:border-orange-500"
              />
              {exercise.weight_per_side && (
                <p className="mt-1 text-[10px] text-white/30">peso por lado</p>
              )}
            </div>

            {/* Reps */}
            <InputField
              label={formatRepsLabel(rx)}
              value={reps}
              onChange={setReps}
              type="number"
              inputMode="numeric"
            />
          </>
        )}

        {/* RIR — only if prescribed */}
        {showRir && (
          <InputField
            label="RIR"
            value={rir}
            onChange={setRir}
            type="number"
            inputMode="numeric"
          />
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        className="mt-6 w-full rounded-xl bg-orange-600 py-4 font-['Oswald'] text-lg font-semibold text-white shadow-lg shadow-orange-600/20 active:scale-[0.98] active:bg-orange-700"
      >
        {step.setNumber === step.totalSets &&
        !step.supersetGroup
          ? "Concluir exercício ✓"
          : "Registar set ›"}
      </button>
    </div>
  );
}

// ── Small helpers ──

function InputField({
  label,
  value,
  onChange,
  type,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
      <span className="text-sm text-white/60">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-transparent text-right text-lg font-semibold text-white outline-none"
      />
    </div>
  );
}

function formatRepsLabel(rx: Prescription): string {
  if (rx.reps_min && rx.reps_max) {
    return `Reps (${rx.reps_min}-${rx.reps_max})`;
  }
  if (rx.reps) {
    return `Reps (${rx.reps})`;
  }
  return "Reps";
}
