import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { AthleteOutletContext } from "@/components/atleta/AthleteLayout";

const FEATURES = [
  {
    icon: (
      <svg className="h-6 w-6 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: "Treino de Força",
    description: "Plano personalizado pelo teu coach, executado no telemóvel. Sets, cargas e descanso guiados.",
    to: "/atleta/forca",
  },
  {
    icon: (
      <svg className="h-6 w-6 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: "Progressão e Histórico",
    description: "Acompanha a evolução das tuas cargas, volume semanal e sessões anteriores.",
    to: "/atleta/forca",
  },
  {
    icon: (
      <svg className="h-6 w-6 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
    title: "Meus Programas",
    description: "Consulta os teus programas de treino, corrida e muito mais.",
    to: "/atleta/programas",
  },
];

export default function AtletaReceptionPage() {
  const { session } = useOutletContext<AthleteOutletContext>();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex flex-col items-center px-5 pb-8 pt-10">
      {/* ── Logo + Brand ── */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full border border-[#d4a54f55] p-1.5 shadow-[0_0_32px_rgba(212,165,79,0.22)]">
          <img
            src="/assets/img/logo_lht.jpg"
            alt="Lion Hybrid Training"
            className="h-20 w-20 rounded-full object-cover"
          />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#d4a54f]">
            Painel do Atleta
          </p>
          <h1 className="mt-1 font-['Oswald'] text-3xl font-bold uppercase tracking-wide text-[#f7f1e8]">
            Lion Hybrid Training
          </h1>
          <p className="mt-1 font-['Oswald'] text-base font-medium tracking-[0.12em] text-[#d4a54f]">
            Força. Resistência. Consistência.
          </p>
        </div>
      </div>

      {/* ── User info ── */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#d4a54f33] bg-[#141414] px-5 py-3 w-full max-w-sm">
        {session.user.user_metadata?.avatar_url ? (
          <img
            src={session.user.user_metadata.avatar_url}
            alt="Avatar"
            className="h-9 w-9 rounded-full object-cover ring-1 ring-[#d4a54f55]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d4a54f55] bg-[#d4a54f22] text-sm font-bold text-[#d4a54f]">
            {(session.user.user_metadata?.full_name || session.user.email || "?")[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#f7f1e8]">
            {session.user.user_metadata?.full_name || session.user.email}
          </p>
          <p className="text-[11px] text-[#8f99a8]">Sessão ativa</p>
        </div>
      </div>

      {/* ── Feature Cards ── */}
      <div className="mt-6 w-full max-w-sm space-y-3">
        {FEATURES.map((f) => (
          <button
            key={f.title}
            onClick={() => navigate(f.to)}
            className="flex w-full items-start gap-4 rounded-2xl border border-[#d4a54f33] bg-[#141414] px-5 py-4 text-left transition-colors active:bg-[#1a1a1a]"
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d4a54f33] bg-[#d4a54f12]">
              {f.icon}
            </div>
            <div className="min-w-0">
              <p className="font-['Oswald'] text-base font-semibold text-[#f7f1e8]">
                {f.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#8f99a8]">
                {f.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div className="mt-6 w-full max-w-sm space-y-3">
        <button
          onClick={() => navigate("/atleta/forca")}
          className="w-full rounded-2xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-3.5 font-['Oswald'] text-lg font-semibold uppercase tracking-wider text-[#111111] shadow-[0_8px_24px_rgba(212,165,79,0.3)] active:scale-[0.98] transition-transform"
        >
          Ir para o Treino
        </button>

        <button
          onClick={handleSignOut}
          className="w-full text-xs text-[#8f99a8] underline-offset-2 hover:text-[#c8cfda] hover:underline py-2"
        >
          Terminar sessão
        </button>
      </div>

      {/* ── Footer ── */}
      <p className="mt-8 text-center text-[11px] uppercase tracking-[0.25em] text-[#3a3a3a]">
        Lion Hybrid Training © {new Date().getFullYear()}
      </p>
    </div>
  );
}
