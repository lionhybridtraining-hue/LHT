import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLocation } from "react-router-dom";
import "./ai-assistant-fab.css";

type AiAssistantFabProps = {
  onActivate?: () => void;
  isOpen?: boolean;
};

export default function AiAssistantFab({ onActivate, isOpen = false }: AiAssistantFabProps) {
  const [hasSession, setHasSession] = useState(false);
  const location = useLocation();
  const inAthleteApp = /(^|\/)atleta(\/|$)/.test(location.pathname);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!hasSession) return null;

  return (
    <div className={`ai-fab-wrap ${inAthleteApp ? "ai-fab-wrap--athlete" : ""}`} aria-live="polite">
      <span className="ai-fab-label">{isOpen ? "Fechar chat" : "Assistente IA"}</span>

      <button
        type="button"
        className="ai-fab"
        aria-label={isOpen ? "Fechar assistente IA" : "Abrir assistente IA"}
        title={isOpen ? "Fechar assistente IA" : "Abrir assistente IA"}
        onClick={() => onActivate?.()}
      >
        <MessageCircle size={20} strokeWidth={2.2} />
        <span className="ai-fab-dot" aria-hidden="true" />
      </button>
    </div>
  );
}
