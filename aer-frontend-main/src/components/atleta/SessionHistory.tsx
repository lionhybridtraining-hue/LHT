import { useState, useEffect } from "react";
import type { PlanExercise, SessionSummary } from "@/types/strength";
import { fetchSessionHistory } from "@/services/athlete-strength";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  planId?: string;
  exercises?: PlanExercise[];
}

const CHART_COLORS = ["#d4a54f", "#5dc8ff", "#7ddf87", "#f28b82"];

function estimate1rm(loadKg: number, reps: number) {
  return loadKg * (1 + reps / 30);
}

export default function SessionHistory({ planId, exercises }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const exerciseNameByPlanExercise = new Map<string, string>();
  for (const ex of exercises || []) {
    exerciseNameByPlanExercise.set(ex.id, ex.exercise.name);
  }

  const seriesPointsByExercise = new Map<string, Array<{ date: string; value: number }>>();
  for (const session of sessions) {
    const day = session.session_date || session.started_at?.slice(0, 10);
    if (!day) continue;

    const bestPerExercise = new Map<string, number>();
    for (const set of session.sets) {
      if (!set.plan_exercise_id || set.load_kg == null || set.reps == null || set.reps <= 0) continue;
      const exerciseName =
        exerciseNameByPlanExercise.get(set.plan_exercise_id) || `Exercício ${set.plan_exercise_id.slice(0, 6)}`;
      const estimate = estimate1rm(set.load_kg, set.reps);
      const current = bestPerExercise.get(exerciseName) || 0;
      if (estimate > current) bestPerExercise.set(exerciseName, estimate);
    }

    for (const [exerciseName, bestEstimate] of bestPerExercise.entries()) {
      if (!seriesPointsByExercise.has(exerciseName)) {
        seriesPointsByExercise.set(exerciseName, []);
      }
      seriesPointsByExercise.get(exerciseName)!.push({
        date: day,
        value: Math.round(bestEstimate * 10) / 10,
      });
    }
  }

  const topExercises = Array.from(seriesPointsByExercise.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([name]) => name);

  const allDates = Array.from(
    new Set(
      topExercises.flatMap((name) =>
        (seriesPointsByExercise.get(name) || []).map((p) => p.date)
      )
    )
  ).sort();

  const chartData = allDates.map((date) => {
    const point: Record<string, string | number | null> = {
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
      }),
    };

    for (const name of topExercises) {
      const found = (seriesPointsByExercise.get(name) || []).find((p) => p.date === date);
      point[name] = found ? found.value : null;
    }

    return point;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSessionHistory(planId)
      .then((res) => {
        if (!cancelled) setSessions(res.sessions);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar histórico");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [planId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-sm text-red-400">{error}</div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-[#8f99a8]">Ainda não tens treinos concluídos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chartData.length > 1 && topExercises.length > 0 && (
        <div className="rounded-2xl border border-[#d4a54f22] bg-[#171717] p-4">
          <div className="mb-3">
            <h3 className="font-['Oswald'] text-lg text-[#f7f1e8]">Evolução estimada de 1RM</h3>
            <p className="text-xs text-[#8f99a8]">Melhor set do dia por exercício ($1RM = carga \times (1 + reps/30)$).</p>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="label" tick={{ fill: "#8f99a8", fontSize: 11 }} axisLine={{ stroke: "#2f2f2f" }} tickLine={false} />
                <YAxis tick={{ fill: "#8f99a8", fontSize: 11 }} axisLine={{ stroke: "#2f2f2f" }} tickLine={false} width={38} />
                <Tooltip
                  contentStyle={{
                    background: "#111111",
                    border: "1px solid #3b3b3b",
                    borderRadius: "12px",
                    color: "#f7f1e8",
                  }}
                />
                {topExercises.map((name, idx) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    connectNulls
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {sessions.map((s) => {
        const expanded = expandedId === s.id;
        const date = new Date(s.started_at);
        const dayLabel = date.toLocaleDateString("pt-PT", {
          day: "numeric",
          month: "short",
        });
        const startedAt = new Date(s.started_at);
        const finishedAt = s.finished_at ? new Date(s.finished_at) : null;
        const durationMin = finishedAt
          ? Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000)
          : s.totalDuration > 0
            ? Math.round(s.totalDuration / 60)
            : null;

        return (
          <div key={s.id} className="rounded-2xl border border-[#d4a54f22] bg-[#171717] overflow-hidden">
            <button
              onClick={() => setExpandedId(expanded ? null : s.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d4a54f22]">
                <span className="font-['Oswald'] text-sm font-bold text-[#d4a54f]">
                  D{s.day_number}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-['Oswald'] text-base font-medium text-[#f7f1e8]">
                  Sem. {s.week_number} · Dia {s.day_number}
                </p>
                <p className="mt-0.5 text-[11px] text-[#8f99a8]">
                  {dayLabel}
                  {durationMin != null && ` · ${durationMin} min`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {s.totalVolume > 0 && (
                  <p className="font-['Oswald'] text-sm font-bold text-[#d4a54f]">
                    {Math.round(s.totalVolume)} kg
                  </p>
                )}
                <p className="text-[10px] text-[#8f99a8]">
                  {s.totalSets} set{s.totalSets !== 1 ? "s" : ""}
                </p>
              </div>
              <svg
                className={`h-4 w-4 shrink-0 text-[#8f99a8] transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expanded && s.sets.length > 0 && (
              <div className="border-t border-[#d4a54f11] px-4 pb-3 pt-2">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-[#8f99a8]">
                      <th className="pb-1.5 font-normal">Set</th>
                      <th className="pb-1.5 font-normal">Carga</th>
                      <th className="pb-1.5 font-normal">Reps</th>
                      <th className="pb-1.5 font-normal">RIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.sets.map((set) => (
                      <tr key={set.id} className="text-[#c8cfda]">
                        <td className="py-0.5">{set.set_number}</td>
                        <td className="py-0.5">
                          {set.load_kg != null ? `${set.load_kg}kg` : "—"}
                        </td>
                        <td className="py-0.5">
                          {set.reps != null ? set.reps : set.duration_seconds != null ? `${set.duration_seconds}s` : "—"}
                        </td>
                        <td className="py-0.5">
                          {set.rir != null ? set.rir : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
