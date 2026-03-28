import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AthleteAuthGuard from "@/components/atleta/AthleteAuthGuard";
import {
  fetchAthleteRunningPrograms,
  type RunningPlanEntry,
} from "@/services/athlete-programs";
import type { Session } from "@supabase/supabase-js";

const BG =
  "radial-gradient(circle at top, rgba(212,165,79,0.14) 0%, #1a1a1a 46%, #090909 100%)";

export default function AtletaProgramasPage() {
  return <AthleteAuthGuard>{(session) => <ProgramasContent session={session} />}</AthleteAuthGuard>;
}

function ProgramasContent({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runningPrograms, setRunningPrograms] = useState<RunningPlanEntry[]>([]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchAthleteRunningPrograms();
        if (!isMounted) return;
        setRunningPrograms(payload.runningPrograms || []);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel carregar os programas.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const runningPlan = useMemo(() => {
    if (!runningPrograms.length) return null;
    return runningPrograms[0];
  }, [runningPrograms]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: BG }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center px-5 pb-14 pt-10 text-[#e4e8ef]"
      style={{ background: BG }}
    >
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#d4a54f]">Area do Atleta</p>
          <h1 className="mt-1 font-['Oswald'] text-4xl font-bold uppercase tracking-wide text-[#f7f1e8]">
            Meus Programas
          </h1>
          <p className="mt-2 text-xs text-[#8f99a8]">
            Sessao ativa: {session.user.user_metadata?.full_name || session.user.email}
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-[#7c1f1f] bg-[#2a1111] px-4 py-3 text-sm text-[#ffd4d4]">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          <ProgramCard
            title="Plano de Corrida"
            subtitle={resolveRunningSubtitle(runningPlan)}
            badge={resolveRunningBadge(runningPlan)}
            onOpen={() => navigate("/formulario")}
            ctaLabel={runningPlan ? "Abrir Plano" : "Gerar Plano"}
            secondaryLabel="Historico em evolucao"
          />

          <ProgramCard
            title="Treino de Forca"
            subtitle="Acede ao teu plano de forca com sessoes, cargas e historico."
            badge="Disponivel"
            onOpen={() => navigate("/atleta/forca")}
            ctaLabel="Abrir Forca"
            secondaryLabel="Atualizacao em tempo real"
          />
        </div>

        <button
          onClick={() => navigate("/atleta")}
          className="mt-8 w-full rounded-xl border border-[#d4a54f33] bg-[#151515] py-3 text-sm font-semibold text-[#f7f1e8] hover:bg-[#1c1c1c]"
        >
          Voltar ao Hub
        </button>
      </div>
    </div>
  );
}

function ProgramCard(props: {
  title: string;
  subtitle: string;
  badge: string;
  onOpen: () => void;
  ctaLabel: string;
  secondaryLabel: string;
}) {
  const { title, subtitle, badge, onOpen, ctaLabel, secondaryLabel } = props;

  return (
    <article className="rounded-2xl border border-[#d4a54f33] bg-[#141414] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-['Oswald'] text-2xl font-semibold text-[#f7f1e8]">{title}</h2>
        <span className="rounded-full border border-[#d4a54f55] bg-[#d4a54f12] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d4a54f]">
          {badge}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">{subtitle}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#555d69]">{secondaryLabel}</p>

      <button
        onClick={onOpen}
        className="mt-4 w-full rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3 font-['Oswald'] text-base font-semibold uppercase tracking-[0.08em] text-[#111111] shadow-[0_8px_22px_rgba(212,165,79,0.28)] active:scale-[0.98]"
      >
        {ctaLabel}
      </button>
    </article>
  );
}

function resolveRunningSubtitle(runningPlan: RunningPlanEntry | null): string {
  if (!runningPlan) {
    return "Ainda nao tens um plano de corrida guardado. Gera o teu plano para comecar.";
  }

  const pieces: string[] = [];

  if (runningPlan.programDistanceKm) {
    pieces.push(`${runningPlan.programDistanceKm} km`);
  }

  if (runningPlan.trainingFrequency) {
    pieces.push(`${runningPlan.trainingFrequency} treinos/semana`);
  }

  if (runningPlan.generatedAt) {
    pieces.push(`gerado em ${toLocaleDate(runningPlan.generatedAt)}`);
  }

  const summary = pieces.length ? pieces.join(" · ") : "Plano guardado";
  return `${summary}.`;
}

function resolveRunningBadge(runningPlan: RunningPlanEntry | null): string {
  if (!runningPlan) return "Sem plano";
  if (runningPlan.status === "active") return "Ativo";
  if (runningPlan.status === "pending") return "Pendente";
  return "Sem plano";
}

function toLocaleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
