import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enforceSessionMaxAge, signInWithGoogle, supabase } from "@/lib/supabase";

const BG = "radial-gradient(circle at top, rgba(212,165,79,0.14) 0%, #1a1a1a 46%, #090909 100%)";

export default function AtletaLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      const wasExpired = await enforceSessionMaxAge(session);
      if (!wasExpired && session?.user) {
        navigate("/atleta", { replace: true });
        return;
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      const wasExpired = await enforceSessionMaxAge(session);
      if (!wasExpired && session?.user) {
        navigate("/atleta", { replace: true });
      } else {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await signInWithGoogle("/atleta");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel iniciar sessao.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: BG }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 text-[#e4e8ef]" style={{ background: BG }}>
      <div className="w-full max-w-md rounded-[28px] border border-[#d4a54f29] bg-[#121212] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.36)]">
        <div className="text-center">
          <img
            src="/assets/img/logo_lht.jpg"
            alt="Lion Hybrid Training"
            className="mx-auto h-20 w-20 rounded-full border border-[#d4a54f55] object-cover shadow-[0_0_20px_rgba(212,165,79,0.25)]"
          />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#d4a54f]">
            Lion Hybrid Training
          </p>
          <h1 className="mt-2 font-['Oswald'] text-3xl font-semibold uppercase tracking-[0.04em] text-[#f7f1e8]">
            Sistema de Login
          </h1>
          <p className="mt-2 text-sm text-[#a9b2bf]">
            Entra para aceder ao teu ecossistema de treino.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-4 py-3 text-sm font-semibold text-[#111111] shadow-[0_8px_24px_rgba(212,165,79,0.3)] disabled:opacity-70"
        >
          {submitting ? "A autenticar..." : "Entrar com Google"}
        </button>

        <button
          type="button"
          onClick={() => navigate("/atleta", { replace: true })}
          className="mt-3 w-full rounded-xl border border-[#d4a54f55] px-4 py-3 text-sm font-semibold text-[#f4f6fa] hover:bg-[#1f1f1f]"
        >
          Voltar
        </button>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-[#7c1f1f] bg-[#2a1111] px-3 py-2 text-xs text-[#ffd4d4]">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
