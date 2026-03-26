import type { WorkoutSession } from "@/types/strength";
import type { SetData } from "./ExerciseScreen";

interface Props {
  session: WorkoutSession;
  loggedSets: SetData[];
  onClose: () => void;
}

export default function CompletionScreen({
  session,
  loggedSets,
  onClose,
}: Props) {
  const startedAt = new Date(session.started_at);
  const finishedAt = session.finished_at
    ? new Date(session.finished_at)
    : new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const durationMin = Math.round(durationMs / 60000);

  const uniqueExercises = new Set(loggedSets.map((s) => s.planExerciseId)).size;
  const totalSets = loggedSets.length;
  const totalVolume = loggedSets.reduce(
    (acc, s) => acc + (s.loadKg ?? 0) * (s.reps ?? 0),
    0
  );
  const totalDuration = loggedSets.reduce(
    (acc, s) => acc + (s.durationSeconds ?? 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.14),#1a1a1a_46%,#090909)] px-6">
      {/* Success icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#d4a54f66] bg-[#d4a54f22]">
        <svg className="h-10 w-10 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="font-['Oswald'] text-3xl font-bold text-[#f7f1e8]">
        Treino concluído!
      </h1>
      <p className="mt-1 text-sm text-[#8f99a8]">Bom trabalho</p>

      {/* Stats */}
      <div className="mt-8 grid w-full max-w-xs grid-cols-2 gap-3">
        <StatCard label="Duração" value={`${durationMin} min`} />
        <StatCard label="Exercícios" value={String(uniqueExercises)} />
        <StatCard label="Sets" value={String(totalSets)} />
        <StatCard
          label="Volume"
          value={totalVolume > 0 ? `${Math.round(totalVolume)} kg` : "—"}
        />
        {totalDuration > 0 && (
          <StatCard
            label="Tempo sob tensão"
            value={`${totalDuration}s`}
          />
        )}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="mt-10 rounded-2xl border border-[#d4a54f66] bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-10 py-4 font-['Oswald'] text-lg font-semibold text-[#111111] shadow-lg shadow-[#00000066]"
      >
        Voltar ao plano
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#d4a54f22] bg-[#171717] px-4 py-3 text-center">
      <p className="font-['Oswald'] text-2xl font-bold text-[#d4a54f]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#8f99a8]">
        {label}
      </p>
    </div>
  );
}
