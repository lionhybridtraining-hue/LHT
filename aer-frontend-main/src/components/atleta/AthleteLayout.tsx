import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase, enforceSessionMaxAge } from "@/lib/supabase";
import { fetchAthleteProfile } from "@/services/athlete-profile";
import { BottomNavProvider, useBottomNav } from "@/contexts/BottomNavContext";
import type { Session } from "@supabase/supabase-js";

const BG = "radial-gradient(circle at top, rgba(212,165,79,0.14) 0%, #1a1a1a 46%, #090909 100%)";

export default function AthleteLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Auth check ──
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      const expired = await enforceSessionMaxAge(s);
      setSession(expired ? null : s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const expired = await enforceSessionMaxAge(s);
      setSession(expired ? null : s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Redirect to login if unauthenticated ──
  useEffect(() => {
    if (!loading && !session) {
      navigate("/atleta/login", { replace: true });
    }
  }, [loading, session, navigate]);

  // ── Profile completion check ──
  useEffect(() => {
    if (!session) return;
    let mounted = true;

    const check = async () => {
      try {
        const data = await fetchAthleteProfile();
        if (mounted) setProfileComplete(!!data.profileComplete);
      } catch {
        if (mounted) setProfileComplete(false);
      }
    };

    check();
    return () => { mounted = false; };
  }, [session]);

  // ── Redirect to perfil if profile incomplete (unless already on perfil) ──
  useEffect(() => {
    if (profileComplete === null) return; // still checking
    const onPerfilPage = location.pathname.replace(/\/$/, "") === "/atleta/perfil";
    if (!profileComplete && !onPerfilPage) {
      navigate("/atleta/perfil", { replace: true });
    }
  }, [profileComplete, location.pathname, navigate]);

  // ── Loading state ──
  if (loading || !session || profileComplete === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: BG }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  return (
    <BottomNavProvider>
      <div className="flex min-h-screen flex-col text-[#e4e8ef]" style={{ background: BG }}>
        <div className="flex-1 pb-16">
          <Outlet context={{ session, profileComplete, setProfileComplete }} />
        </div>
        <BottomNav />
      </div>
    </BottomNavProvider>
  );
}

// ── Types for outlet context ──
export interface AthleteOutletContext {
  session: Session;
  profileComplete: boolean;
  setProfileComplete: (v: boolean) => void;
}

// ── Bottom Navigation ──

const NAV_ITEMS = [
  {
    to: "/atleta",
    label: "Home",
    icon: (active: boolean) => (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    end: true,
  },
  {
    to: "/atleta/calendario",
    label: "Calendário",
    icon: (active: boolean) => (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    to: "/atleta/forca",
    label: "Treino",
    icon: (active: boolean) => (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    to: "/atleta/programas",
    label: "Programas",
    icon: (active: boolean) => (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l4.179 2.25L12 22.5l-9.75-5.25 4.179-2.25" />
      </svg>
    ),
  },
  {
    to: "/atleta/perfil",
    label: "Perfil",
    icon: (active: boolean) => (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
];

function BottomNav() {
  const { visible } = useBottomNav();

  if (!visible) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 backdrop-blur-sm safe-area-bottom">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                isActive
                  ? "text-[#d4a54f]"
                  : "text-[#8f99a8] active:text-[#c8cfda]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {item.icon(isActive)}
                <span className={`font-['Oswald'] text-[10px] uppercase tracking-[0.08em] ${isActive ? "font-semibold" : "font-normal"}`}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
