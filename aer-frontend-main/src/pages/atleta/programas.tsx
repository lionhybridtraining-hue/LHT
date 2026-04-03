import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchAthleteRunningPrograms,
  type RunningPlanEntry,
} from "@/services/athlete-programs";
import {
  fetchMyPrograms,
  type MyProgram,
  type OrphanedInstance,
  type ProgramPhase,
} from "@/services/athlete-my-programs";
import { createInstance } from "@/services/athlete-strength";
import type { AthleteOutletContext } from "@/components/atleta/AthleteLayout";

export default function AtletaProgramasPage() {
  const { session } = useOutletContext<AthleteOutletContext>();
  return <ProgramasContent session={session} />;
}

function ProgramasContent({ session }: { session: AthleteOutletContext["session"] }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runningPrograms, setRunningPrograms] = useState<RunningPlanEntry[]>([]);
  const [myPrograms, setMyPrograms] = useState<MyProgram[]>([]);
  const [orphanedInstances, setOrphanedInstances] = useState<OrphanedInstance[]>([]);
  const [creatingInstance, setCreatingInstance] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [runningPayload, programsPayload] = await Promise.all([
          fetchAthleteRunningPrograms().catch(() => ({ runningPrograms: [] })),
          fetchMyPrograms(),
        ]);
        if (!isMounted) return;
        setRunningPrograms(runningPayload.runningPrograms || []);
        setMyPrograms(programsPayload.programs || []);
        setOrphanedInstances(programsPayload.orphanedInstances || []);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel carregar os programas.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => { isMounted = false; };
  }, []);

  const runningPlan = useMemo(() => {
    if (!runningPrograms.length) return null;
    return runningPrograms[0];
  }, [runningPrograms]);
  const runningPlanOpenPath = runningPlan?.openPath || "/atleta/onboarding/formulario";
  const runningPlanRegeneratePath = runningPlan?.regeneratePath || "/atleta/onboarding/formulario";

  const handleStartInstance = async (programId: string, planId?: string) => {
    setCreatingInstance(programId);
    try {
      await createInstance({ programId, planId });
      const payload = await fetchMyPrograms();
      setMyPrograms(payload.programs || []);
      setOrphanedInstances(payload.orphanedInstances || []);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Erro ao iniciar programa.");
    } finally {
      setCreatingInstance(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  const hasStrengthPrograms = myPrograms.length > 0 || orphanedInstances.length > 0;

  return (
    <div className="flex flex-col items-center px-5 pb-8 pt-6 text-[#e4e8ef]">
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

        <div className="mt-6 rounded-[28px] border border-[#d4a54f26] bg-[linear-gradient(180deg,rgba(27,27,27,0.96),rgba(15,15,15,0.96))] px-5 py-5 shadow-[0_20px_46px_rgba(0,0,0,0.34)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#d4a54f]">
            Biblioteca do atleta
          </p>
          <h2 className="mt-2 font-['Oswald'] text-3xl font-semibold uppercase tracking-[0.04em] text-[#f7f1e8]">
            Continua o teu plano e descobre o proximo passo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">
            Acede rapidamente ao teu plano de corrida guardado e explora outras opcoes para complementar o teu progresso.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-[#7c1f1f] bg-[#2a1111] px-4 py-3 text-sm text-[#ffd4d4]">
            {errorMessage}
          </div>
        ) : null}

        {/* ── Strength Programs (from purchases + assignments) ── */}
        {hasStrengthPrograms ? (
          <div className="mt-8 space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8f99a8]">
              Treino de Forca
            </p>
            {myPrograms.map((p) => (
              <StrengthProgramCard
                key={p.purchase.id}
                program={p}
                creatingInstance={creatingInstance}
                onStart={(planId?: string) => handleStartInstance(p.purchase.programId, planId)}
                onOpen={() =>
                  navigate(
                    p.instance
                      ? `/atleta/forca?instanceId=${p.instance.id}`
                      : "/atleta/forca"
                  )
                }
              />
            ))}
            {orphanedInstances.map((inst) => (
              <OrphanedInstanceCard
                key={inst.id}
                instance={inst}
                onOpen={() => navigate(`/atleta/forca?instanceId=${inst.id}`)}
              />
            ))}
          </div>
        ) : null}

        {/* ── Running Plan ── */}
        <div className={hasStrengthPrograms ? "mt-6 space-y-4" : "mt-8 space-y-4"}>
          {hasStrengthPrograms ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8f99a8]">
              Corrida
            </p>
          ) : null}
          <RunningProgramCard
            runningPlan={runningPlan}
            onOpen={() => navigate(runningPlanOpenPath)}
            onGenerateNew={() => navigate(runningPlanRegeneratePath)}
          />

          {/* Fallback strength card when no purchases/instances exist */}
          {!hasStrengthPrograms ? (
            <StaticCard
              title="Treino de Forca"
              subtitle="Acede ao teu plano de forca com sessoes, cargas e historico."
              badge="Disponivel"
              onOpen={() => navigate("/atleta/forca")}
              ctaLabel="Abrir Forca"
            />
          ) : null}
        </div>

        <div className="mt-8 space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8f99a8]">
            Descobre outras opcoes
          </p>
          <DiscoveryCard
            title="Catalogo LHT"
            subtitle="Explora todos os programas e encontra a proxima opcao para complementar o teu plano atual."
            badge="Explorar"
            ctaLabel="Ver catalogo completo"
            onOpen={() => window.location.assign("/programas")}
          />
          {!hasStrengthPrograms ? (
            <DiscoveryCard
              title="Complementa com Forca"
              subtitle="Acrescenta um programa de forca para suportar consistencia, resiliencia e performance na corrida."
              badge="Upsell"
              ctaLabel="Descobrir opcoes de forca"
              onOpen={() => window.location.assign("/programas")}
            />
          ) : null}
        </div>

      </div>
    </div>
  );
}

// ── Strength program card (purchase-based) ──

const PHASE_LABELS: Record<ProgramPhase, string> = {
  coached: "Gerido pelo Coach",
  self_serve: "Self-serve",
  active: "Ativo",
  grace: "Pagamento pendente",
  expired: "Expirado",
  cancelled: "Cancelado",
};

const PHASE_COLORS: Record<ProgramPhase, { border: string; bg: string; text: string }> = {
  coached: { border: "#d4a54f55", bg: "#d4a54f18", text: "#d4a54f" },
  self_serve: { border: "#238636", bg: "#23863618", text: "#3fb950" },
  active: { border: "#238636", bg: "#23863618", text: "#3fb950" },
  grace: { border: "#d29922", bg: "#d2992218", text: "#e3b341" },
  expired: { border: "#f8514955", bg: "#f8514918", text: "#f85149" },
  cancelled: { border: "#8b949e55", bg: "#8b949e18", text: "#8b949e" },
};

function StrengthProgramCard({
  program,
  creatingInstance,
  onStart,
  onOpen,
}: {
  program: MyProgram;
  creatingInstance: string | null;
  onStart: (planId?: string) => void;
  onOpen: () => void;
}) {
  const { purchase, program: meta, instance, phase, isCoachLocked, canCreateInstance, sourceType, availableTemplates } = program;
  const navigate = useNavigate();
  // Program name is the top-level product (AER), plan name is the specific strength block underneath
  const programName = meta?.name || instance?.planName || "Programa de Forca";
  const planName = instance?.planName && instance.planName !== meta?.name ? instance.planName : null;
  const colors = PHASE_COLORS[phase] || PHASE_COLORS.active;
  const isCreating = creatingInstance === purchase.programId;

  const hasActiveInstance = instance && (instance.status === "active" || instance.status === "paused");
  const isAssignment = sourceType === "assignment";

  return (
    <article className="rounded-2xl border border-[#d4a54f33] bg-[#141414] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-['Oswald'] text-2xl font-semibold text-[#f7f1e8]">{programName}</h2>
          {planName ? (
            <p className="mt-0.5 text-xs text-[#8f99a8]">Plano: {planName}</p>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text }}
        >
          {PHASE_LABELS[phase] || phase}
        </span>
      </div>

      {/* Subtitle */}
      {instance ? (
        <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">
          {instance.startDate ? `Inicio: ${toLocaleDate(instance.startDate)}` : ""}
          {instance.status === "paused" ? " · Pausado" : ""}
        </p>
      ) : isAssignment ? (
        <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">
          {purchase.paidAt ? `Atribuido em ${toLocaleDate(purchase.paidAt)}` : "Programa atribuido pelo coach"}
          {purchase.expiresAt ? ` · Acompanhamento ate ${toLocaleDate(purchase.expiresAt)}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">
          {meta ? `${meta.durationWeeks} semanas · ${meta.billingType === "recurring" ? "Subscrição" : "Pagamento único"}` : "Programa disponivel."}
        </p>
      )}

      {isCoachLocked && (instance?.coachLockedUntil || purchase.expiresAt) ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#d4a54f]">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Gerido pelo coach ate {toLocaleDate(instance?.coachLockedUntil || purchase.expiresAt || "")}</span>
        </div>
      ) : null}

      {/* CTA */}
      {program.needsPresetSelection && program.presetSelection === "athlete" ? (
        <button
          onClick={() => navigate("/atleta/calendario")}
          className="mt-4 w-full rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3 font-['Oswald'] text-base font-semibold uppercase tracking-[0.08em] text-[#111111] shadow-[0_8px_22px_rgba(212,165,79,0.28)] active:scale-[0.98]"
        >
          Configurar Calendario
        </button>
      ) : program.needsPresetSelection && program.presetSelection === "coach" ? (
        <p className="mt-4 rounded-xl border border-[#d4a54f33] bg-[#1a1612] px-4 py-3 text-center text-xs text-[#8f99a8]">
          O teu coach esta a configurar o calendário
        </p>
      ) : canCreateInstance && !hasActiveInstance && availableTemplates && availableTemplates.length > 1 ? (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8f99a8]">Escolhe o teu plano</p>
          {availableTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => onStart(t.id)}
              disabled={isCreating}
              className="w-full rounded-xl border border-[#d4a54f33] bg-[#1a1612] px-4 py-3 text-left active:scale-[0.98] disabled:opacity-50"
            >
              <span className="block font-['Oswald'] text-sm font-semibold text-[#f7f1e8]">{t.name}</span>
              {t.description ? (
                <span className="mt-0.5 block text-xs text-[#8f99a8]">{t.description}</span>
              ) : null}
              <span className="mt-1 block text-[10px] text-[#d4a54f]">{t.totalWeeks} semanas · {isCreating ? "A iniciar..." : "Comecar"}</span>
            </button>
          ))}
        </div>
      ) : canCreateInstance && !hasActiveInstance ? (
        <button
          onClick={() => onStart(availableTemplates?.[0]?.id)}
          disabled={isCreating}
          className="mt-4 w-full rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3 font-['Oswald'] text-base font-semibold uppercase tracking-[0.08em] text-[#111111] shadow-[0_8px_22px_rgba(212,165,79,0.28)] active:scale-[0.98] disabled:opacity-50"
        >
          {isCreating ? "A iniciar..." : "Comecar Programa"}
        </button>
      ) : hasActiveInstance ? (
        <button
          onClick={onOpen}
          className="mt-4 w-full rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3 font-['Oswald'] text-base font-semibold uppercase tracking-[0.08em] text-[#111111] shadow-[0_8px_22px_rgba(212,165,79,0.28)] active:scale-[0.98]"
        >
          Abrir Treino
        </button>
      ) : isAssignment && isCoachLocked && !instance ? (
        <p className="mt-4 rounded-xl border border-[#d4a54f33] bg-[#1a1612] px-4 py-3 text-center text-xs text-[#8f99a8]">
          O teu coach esta a configurar o plano de treino
        </p>
      ) : (phase === "expired" || phase === "cancelled") ? (
        <p className="mt-4 text-center text-xs text-[#555d69]">Programa indisponivel</p>
      ) : null}
    </article>
  );
}

// ── Orphaned instance card (coach ad-hoc, no Stripe purchase) ──

function OrphanedInstanceCard({
  instance,
  onOpen,
}: {
  instance: OrphanedInstance;
  onOpen: () => void;
}) {
  const name = instance.plan?.name || "Plano de Forca";
  const isActive = instance.status === "active" || instance.status === "paused";
  const isLocked = !!(instance.coach_locked_until && instance.coach_locked_until >= new Date().toISOString().slice(0, 10));

  return (
    <article className="rounded-2xl border border-[#d4a54f33] bg-[#141414] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-['Oswald'] text-2xl font-semibold text-[#f7f1e8]">{name}</h2>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            border: `1px solid ${isLocked ? "#d4a54f55" : "#238636"}`,
            background: isLocked ? "#d4a54f18" : "#23863618",
            color: isLocked ? "#d4a54f" : "#3fb950",
          }}
        >
          {isLocked ? "Gerido pelo Coach" : instance.status === "paused" ? "Pausado" : "Ativo"}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">
        {instance.start_date ? `Inicio: ${toLocaleDate(instance.start_date)}` : "Sem data de inicio"}
        {instance.status === "paused" ? " · Pausado" : ""}
      </p>

      {isLocked && instance.coach_locked_until ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[#d4a54f]">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Gerido pelo coach ate {toLocaleDate(instance.coach_locked_until)}</span>
        </div>
      ) : null}

      {isActive ? (
        <button
          onClick={onOpen}
          className="mt-4 w-full rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3 font-['Oswald'] text-base font-semibold uppercase tracking-[0.08em] text-[#111111] shadow-[0_8px_22px_rgba(212,165,79,0.28)] active:scale-[0.98]"
        >
          Abrir Treino
        </button>
      ) : (
        <p className="mt-4 text-center text-xs text-[#555d69]">
          {instance.status === "completed" ? "Programa concluido" : "Programa cancelado"}
        </p>
      )}
    </article>
  );
}

// ── Running plan card ──

function RunningProgramCard({
  runningPlan,
  onOpen,
  onGenerateNew,
}: {
  runningPlan: RunningPlanEntry | null;
  onOpen: () => void;
  onGenerateNew: () => void;
}) {
  return (
    <StaticCard
      title="Plano de Corrida"
      subtitle={resolveRunningSubtitle(runningPlan)}
      badge={resolveRunningBadge(runningPlan)}
      onOpen={onOpen}
      ctaLabel={runningPlan ? "Abrir Plano" : "Gerar Plano"}
      secondaryAction={
        runningPlan
          ? {
              label: "Gerar novo plano",
              onClick: onGenerateNew,
            }
          : undefined
      }
    />
  );
}

// ── Static fallback card ──

function StaticCard(props: {
  title: string;
  subtitle: string;
  badge: string;
  onOpen: () => void;
  ctaLabel: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}) {
  const { title, subtitle, badge, onOpen, ctaLabel, secondaryAction } = props;

  return (
    <article className="rounded-2xl border border-[#d4a54f33] bg-[#141414] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-['Oswald'] text-2xl font-semibold text-[#f7f1e8]">{title}</h2>
        <span className="rounded-full border border-[#d4a54f55] bg-[#d4a54f12] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d4a54f]">
          {badge}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#8f99a8]">{subtitle}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={onOpen}
          className="w-full rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3 font-['Oswald'] text-base font-semibold uppercase tracking-[0.08em] text-[#111111] shadow-[0_8px_22px_rgba(212,165,79,0.28)] active:scale-[0.98]"
        >
          {ctaLabel}
        </button>
        {secondaryAction ? (
          <button
            onClick={secondaryAction.onClick}
            className="w-full rounded-xl border border-[#d4a54f44] px-4 py-3 text-sm font-semibold text-[#f7f1e8] hover:bg-[#1b1b1b] active:scale-[0.98]"
          >
            {secondaryAction.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DiscoveryCard(props: {
  title: string;
  subtitle: string;
  badge: string;
  ctaLabel: string;
  onOpen: () => void;
}) {
  return <StaticCard {...props} />;
}

// ── Helpers ──

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

  if (runningPlan.storage === "program_assignments") {
    pieces.push("sincronizado na app");
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
