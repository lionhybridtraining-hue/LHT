import { useMemo, useState } from "react";
import type {
  ProgramVariant,
  ExperienceLevel,
  VariantFilters,
} from "@/services/variant-service";
import { extractVariantFilterOptions } from "@/services/variant-service";

const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Iniciante",
  intermediate: "Intermédio",
  advanced: "Avançado",
};

interface VariantPickerProps {
  variants: ProgramVariant[];
  onSelect: (variant: ProgramVariant) => void;
  generating: boolean;
  recommendedVariantId?: string | null;
}

export function VariantPicker({ variants, onSelect, generating, recommendedVariantId = null }: VariantPickerProps) {
  const [filters, setFilters] = useState<VariantFilters>({});
  const { durations, levels, frequencies } = useMemo(
    () => extractVariantFilterOptions(variants),
    [variants]
  );

  const filtered = useMemo(() => {
    return variants.filter((v) => {
      if (filters.durationWeeks != null && v.duration_weeks !== filters.durationWeeks)
        return false;
      if (filters.experienceLevel && v.experience_level !== filters.experienceLevel)
        return false;
      if (filters.weeklyFrequency != null && v.weekly_frequency !== filters.weeklyFrequency)
        return false;
      return true;
    });
  }, [variants, filters]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[#f7f1e8]">
        Escolhe a tua variante de treino
      </h3>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Duration filter */}
        {durations.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#8f99a8]">Duração:</span>
            <button
              onClick={() => setFilters((f) => ({ ...f, durationWeeks: undefined }))}
              className={`rounded px-2 py-0.5 text-[10px] transition ${
                filters.durationWeeks == null
                  ? "bg-[#d4a54f] text-black"
                  : "bg-[#21262d] text-[#8f99a8] hover:text-[#c9d1d9]"
              }`}
            >
              Todas
            </button>
            {durations.map((d) => (
              <button
                key={d}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    durationWeeks: f.durationWeeks === d ? undefined : d,
                  }))
                }
                className={`rounded px-2 py-0.5 text-[10px] transition ${
                  filters.durationWeeks === d
                    ? "bg-[#d4a54f] text-black"
                    : "bg-[#21262d] text-[#8f99a8] hover:text-[#c9d1d9]"
                }`}
              >
                {d}S
              </button>
            ))}
          </div>
        )}

        {/* Experience level filter */}
        {levels.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#8f99a8]">Nível:</span>
            <button
              onClick={() => setFilters((f) => ({ ...f, experienceLevel: undefined }))}
              className={`rounded px-2 py-0.5 text-[10px] transition ${
                !filters.experienceLevel
                  ? "bg-[#d4a54f] text-black"
                  : "bg-[#21262d] text-[#8f99a8] hover:text-[#c9d1d9]"
              }`}
            >
              Todos
            </button>
            {levels.map((l) => (
              <button
                key={l}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    experienceLevel: f.experienceLevel === l ? undefined : l,
                  }))
                }
                className={`rounded px-2 py-0.5 text-[10px] transition ${
                  filters.experienceLevel === l
                    ? "bg-[#d4a54f] text-black"
                    : "bg-[#21262d] text-[#8f99a8] hover:text-[#c9d1d9]"
                }`}
              >
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
        )}

        {/* Frequency filter */}
        {frequencies.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#8f99a8]">Frequência:</span>
            <button
              onClick={() => setFilters((f) => ({ ...f, weeklyFrequency: undefined }))}
              className={`rounded px-2 py-0.5 text-[10px] transition ${
                filters.weeklyFrequency == null
                  ? "bg-[#d4a54f] text-black"
                  : "bg-[#21262d] text-[#8f99a8] hover:text-[#c9d1d9]"
              }`}
            >
              Todas
            </button>
            {frequencies.map((freq) => (
              <button
                key={freq}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    weeklyFrequency: f.weeklyFrequency === freq ? undefined : freq,
                  }))
                }
                className={`rounded px-2 py-0.5 text-[10px] transition ${
                  filters.weeklyFrequency === freq
                    ? "bg-[#d4a54f] text-black"
                    : "bg-[#21262d] text-[#8f99a8] hover:text-[#c9d1d9]"
                }`}
              >
                {freq}×/sem
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Variant cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            onSelect={() => onSelect(variant)}
            generating={generating}
            recommended={recommendedVariantId === variant.id}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 text-center text-xs text-[#8f99a8]">
            Nenhuma variante corresponde aos filtros selecionados.
          </p>
        )}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  onSelect,
  generating,
  recommended,
}: {
  variant: ProgramVariant;
  onSelect: () => void;
  generating: boolean;
  recommended: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={generating}
      className="w-full rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-left transition hover:border-[#d4a54f]/50 disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-[#c9d1d9]">
            {variant.duration_weeks}S · {LEVEL_LABELS[variant.experience_level]} · {variant.weekly_frequency}×/sem
          </span>
          {recommended && (
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d4a54f]">
              recomendada para ti
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {variant.strength_plans?.name && (
          <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] text-blue-300 border border-blue-800/50">
            {variant.strength_plans.name}
          </span>
        )}
        {variant.running_plan_templates?.name && (
          <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-300 border border-emerald-800/50">
            {variant.running_plan_templates.name}
          </span>
        )}
      </div>

      {variant.running_config_preset && (
        <div className="mt-2 text-[10px] text-[#8f99a8]">
          {variant.running_config_preset.initial_weekly_volume_km != null && (
            <span>Volume: {variant.running_config_preset.initial_weekly_volume_km}km/sem</span>
          )}
          {variant.running_config_preset.weekly_progression_pct != null && (
            <span className="ml-2">
              Progressão: {variant.running_config_preset.weekly_progression_pct}%
            </span>
          )}
        </div>
      )}
    </button>
  );
}
