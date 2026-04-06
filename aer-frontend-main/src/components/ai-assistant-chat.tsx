import { FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getAccessToken } from "@/lib/supabase";
import "./ai-assistant-chat.css";

type AiAssistantChatProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const QUICK_PROMPTS = [
  "Como usar este plano?",
  "Como ajustar carga semanal?",
  "Como evitar lesão?",
  "O que dizem os meus check-ins?",
  "Como está a minha carga de treino?",
];

export default function AiAssistantChat({ isOpen, onClose }: AiAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Sou o assistente LHT. Tenho acesso aos teus dados de treino, check-ins e planos. Pergunta o que quiseres!",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, messages, isThinking, error]);

  async function fetchAssistantReply(userMessage: string): Promise<string> {
    try {
      setError(null);

      const token = await getAccessToken();
      if (!token) {
        setError("Faz login para usar o assistente.");
        return "Precisas de estar autenticado para eu poder aceder aos teus dados. Faz login primeiro.";
      }

      const conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch("/.netlify/functions/chat-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Erro de rede" }));
        if (response.status === 401) {
          throw new Error("Sessão expirada. Faz login novamente.");
        }
        throw new Error(errorData.error || "Erro ao comunicar com o assistente");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Erro ao processar a mensagem");
      }

      return data.message;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Erro desconhecido ao contactar o assistente";
      setError(errorMessage);
      console.error("Chat error:", err);
      return "Desculpa, não consegui processar a tua pergunta neste momento. Tenta novamente em alguns instantes.";
    }
  }

  async function pushUserMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsThinking(true);
    setError(null);

    try {
      const assistantReply = await fetchAssistantReply(trimmed);
      
      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: assistantReply,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      console.error("Error getting assistant reply:", err);
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pushUserMessage(draft);
  }

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        className="ai-chat-overlay"
        onClick={onClose}
        aria-label="Fechar chat do assistente"
      />

      <section className="ai-chat-panel" aria-label="Assistente IA LHT">
        <header className="ai-chat-header">
          <div>
            <p className="ai-chat-title">Assistente LHT</p>
            <p className="ai-chat-subtitle">Powered by Gemini AI</p>
          </div>
          <button
            type="button"
            className="ai-chat-close"
            onClick={onClose}
            aria-label="Fechar painel de chat"
          >
            <X size={15} />
          </button>
        </header>

        <div className="ai-chat-quick">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="ai-chat-chip"
              onClick={() => pushUserMessage(prompt)}
              disabled={isThinking}
            >
              {prompt}
            </button>
          ))}
        </div>

        {error && (
          <div className="ai-chat-error">
            <p className="text-xs text-[#ffd4d4]">{error}</p>
          </div>
        )}

        <div className="ai-chat-messages">
          {messages.map((message) => (
            <div key={message.id} className={`ai-chat-row ${message.role}`}>
              <div className="ai-chat-bubble">{message.content}</div>
            </div>
          ))}

          {isThinking ? (
            <div className="ai-chat-row assistant">
              <div className="ai-chat-bubble">A pensar...</div>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <form className="ai-chat-composer" onSubmit={handleSubmit}>
          <input
            className="ai-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreve a tua pergunta..."
            maxLength={300}
            disabled={isThinking}
          />
          <button type="submit" className="ai-chat-send" disabled={!draft.trim() || isThinking}>
            Enviar
          </button>
        </form>
      </section>
    </>
  );
}
