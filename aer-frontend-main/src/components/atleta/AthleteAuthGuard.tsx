import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase, enforceSessionMaxAge } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface Props {
  children: (session: Session) => ReactNode;
}

export default function AthleteAuthGuard({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      const expired = await enforceSessionMaxAge(s);
      setSession(expired ? null : s);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const expired = await enforceSessionMaxAge(s);
      setSession(expired ? null : s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.14),#1a1a1a_46%,#090909)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/atleta" replace />;
  }

  return <>{children(session)}</>;
}
