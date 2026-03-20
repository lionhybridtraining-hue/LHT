import { MessageCircle } from "lucide-react";
import "./ai-assistant-fab.css";

type AiAssistantFabProps = {
  onActivate?: () => void;
  isOpen?: boolean;
};

export default function AiAssistantFab({ onActivate, isOpen = false }: AiAssistantFabProps) {
  return (
    <div className="ai-fab-wrap" aria-live="polite">
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
