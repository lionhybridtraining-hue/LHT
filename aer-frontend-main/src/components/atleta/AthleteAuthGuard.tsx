import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase, enforceSessionMaxAge } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { fetchAthleteProfile } from "@/services/athlete-profile";

interface Props {
  children: (session: Session) => ReactNode;
  enforceProfileCompletion?: boolean;
}

export default function AthleteAuthGuard({ children, enforceProfileCompletion = true }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileCheckLoading, setProfileCheckLoading] = useState(false);
  const [profileComplete, setProfileComplete] = useState(true);

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

  useEffect(() => {
    let mounted = true;

    const checkProfile = async () => {
      if (!session || !enforceProfileCompletion) {
        setProfileCheckLoading(false);
        setProfileComplete(true);
        return;
      }

      setProfileCheckLoading(true);
      try {
        const profile = await fetchAthleteProfile();
        if (!mounted) return;
        setProfileComplete(!!profile.profileComplete);
      } catch {
        if (!mounted) return;
        // Mandatory flow: if profile check fails, force completion route.
        setProfileComplete(false);
      } finally {
        if (mounted) setProfileCheckLoading(false);
      }
    };

    checkProfile();
    return () => {
      mounted = false;
    };
  }, [session, enforceProfileCompletion]);

  if (loading || profileCheckLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.14),#1a1a1a_46%,#090909)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/atleta/login" replace />;
  }

  if (enforceProfileCompletion && !profileComplete) {
    return <Navigate to="/atleta/perfil" replace />;
  }

  return <>{children(session)}</>;
}
