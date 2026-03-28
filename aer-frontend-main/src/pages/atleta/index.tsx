import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enforceSessionMaxAge, supabase, signInWithGoogle } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const BG = "radial-gradient(circle at top, rgba(212,165,79,0.14) 0%, #1a1a1a 46%, #090909 100%)";

const FEATURES = [
  {
    icon: (
      <svg className="h-6 w-6 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: "Treino de Força",
    description: "Plano personalizado pelo teu coach, executado no telemóvel. Sets, cargas e descanso guiados.",
    available: true,
  },
  {
    icon: (
      <svg className="h-6 w-6 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: "Progressão e Histórico",
    description: "Acompanha a evolução das tuas cargas, volume semanal e sessões anteriores.",
    available: true,
  },
  {
    icon: (
      <svg className="h-6 w-6 text-[#d4a54f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
    title: "Plano de Corrida",
    description: "Plano de treino de corrida personalizado integrado com o teu perfil de atleta.",
    available: false,
  },
];

export default function AtletaReceptionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      const wasExpired = await enforceSessionMaxAge(s);
      setSession(wasExpired ? null : s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const wasExpired = await enforceSessionMaxAge(s);
      setSession(wasExpired ? null : s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: BG }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center px-5 pb-16 pt-12 text-[#e4e8ef]"
      style={{ background: BG }}
    >
      {/* ── Logo + Brand ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full border border-[#d4a54f55] p-1.5 shadow-[0_0_32px_rgba(212,165,79,0.22)]">
          <img
            src="/assets/img/logo_lht.jpg"
            alt="Lion Hybrid Training"
            className="h-24 w-24 rounded-full object-cover"
          />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#d4a54f]">
            Painel do Atleta
          </p>
          <h1 className="mt-1 font-['Oswald'] text-4xl font-bold uppercase tracking-wide text-[#f7f1e8]">
            Lion Hybrid Training
          </h1>
          <p className="mt-1.5 font-['Oswald'] text-lg font-medium tracking-[0.12em] text-[#d4a54f]">
            Força. Resistência. Consistência.
          </p>
        </div>
      </div>

      {/* ── Feature Cards ─────────────────────────────────────────── */}
      <div className="mt-10 w-full max-w-sm space-y-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${
              f.available
                ? "border-[#d4a54f33] bg-[#141414]"
                : "border-[#ffffff12] bg-[#0e0e0e] opacity-60"
            }`}
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d4a54f33] bg-[#d4a54f12]">
              {f.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-['Oswald'] text-base font-semibold text-[#f7f1e8]">
                  {f.title}
                </p>
                {!f.available && (
                  <span className="rounded-full border border-[#ffffff22] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#8f99a8]">
                    Em breve
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-[#8f99a8]">
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Auth CTA ─────────────────────────────────────────────── */}
      <div className="mt-10 w-full max-w-sm">
        {session ? (
          /* ── Logged in ── */
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 rounded-2xl border border-[#d4a54f33] bg-[#141414] px-5 py-3.5 w-full">
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

            <button
              onClick={() => navigate("/atleta/forca")}
              className="w-full rounded-2xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-4 font-['Oswald'] text-lg font-semibold uppercase tracking-wider text-[#111111] shadow-[0_8px_24px_rgba(212,165,79,0.3)] active:scale-[0.98] transition-transform"
            >
              Ir para o Treino
            </button>

            <button
              onClick={handleSignOut}
              className="text-xs text-[#8f99a8] underline-offset-2 hover:text-[#c8cfda] hover:underline"
            >
              Terminar sessão
            </button>
          </div>
        ) : (
          /* ── Not logged in ── */
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-sm text-[#8f99a8]">
              Entra com a tua conta Google para aceder ao teu plano de treino personalizado.
            </p>
            <button
              onClick={() => signInWithGoogle("/atleta/forca")}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-gray-800 shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Entrar com Google
            </button>
          </div>
        )}
      </div>

      {/* ── Footer tagline ─────────────────────────────────────────── */}
      <p className="mt-12 text-center text-[11px] uppercase tracking-[0.25em] text-[#3a3a3a]">
        Lion Hybrid Training © {new Date().getFullYear()}
      </p>
    </div>
  );
}
