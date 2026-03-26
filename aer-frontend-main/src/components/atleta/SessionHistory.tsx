import { useState, useEffect } from "react";
import type { SessionSummary } from "@/types/strength";
import { fetchSessionHistory } from "@/services/athlete-strength";

interface Props {
  planId?: string;
}

export default function SessionHistory({ planId }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
