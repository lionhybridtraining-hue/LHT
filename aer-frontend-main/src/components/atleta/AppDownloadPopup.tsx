import { useEffect, useState } from "react";
import { X } from "lucide-react";

const SHOW_DELAY_MS = 10_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface AppDownloadPopupProps {
  /**
   * Show the popup only when user came from legacy /planocorrida/atleta flow
   */
  fromLegacy: boolean;
  /**
   * Show the popup only when on /atleta/plano route
   */
  isOnPlanoPage: boolean;
}

export default function AppDownloadPopup({ fromLegacy, isOnPlanoPage }: AppDownloadPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [installHelp, setInstallHelp] = useState<string | null>(null);

  // Initialize visibility logic on mount
  useEffect(() => {
    // Only show if: legacy flow + on plano page + browser mode (not PWA) + not seen today
    if (!fromLegacy || !isOnPlanoPage) {
      setIsVisible(false);
      return;
    }

    // Check if running in standalone/PWA mode
    const isPwaMode =
      typeof window !== "undefined" &&
      ((navigator as any).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches);

    if (isPwaMode) {
      setIsVisible(false);
      return;
    }

    // Check if user has dismissed this today
    const lastDismissedAt = localStorage.getItem("app_popup_dismissed_at");
    if (lastDismissedAt) {
      const lastDismissedDate = new Date(lastDismissedAt);
      const today = new Date();
      const isSameDay =
        lastDismissedDate.toDateString() === today.toDateString();

      if (isSameDay) {
        setIsVisible(false);
        return;
      }
    }

    // All conditions met: show popup after delay
    const timerId = window.setTimeout(() => {
      setIsVisible(true);
    }, SHOW_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fromLegacy, isOnPlanoPage]);

  const handleDismiss = () => {
    setIsVisible(false);
    // Record dismissal for today
    localStorage.setItem(
      "app_popup_dismissed_at",
      new Date().toISOString()
    );
  };

  const handleDownloadClick = async () => {
    const deferredPrompt = (window as any).__LHT_DEFERRED_INSTALL_PROMPT__ as BeforeInstallPromptEvent | undefined;

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;

        console.log("PWA install user choice:", choice.outcome);
        (window as any).__LHT_DEFERRED_INSTALL_PROMPT__ = null;
        handleDismiss();
        return;
      } catch (error) {
        console.warn("Falha ao abrir prompt de instalação da PWA:", error);
      }
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      setInstallHelp("No iPhone/iPad: Safari → Partilhar → Adicionar ao Ecrã principal.");
      return;
    }

      setInstallHelp("Neste browser, usa o menu (barra de endereços ou três pontos) e seleciona 'Instalar app'.");
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center">
      <div className="relative w-full max-w-sm rounded-t-3xl bg-[#121212] p-6 shadow-2xl md:rounded-3xl md:max-w-md">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-full p-1 text-[#8f99a8] hover:bg-[#1f1f1f] hover:text-[#e4e8ef]"
          aria-label="Close popup"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="pr-8">
          <h2 className="font-['Oswald'] text-xl font-semibold uppercase tracking-[0.04em] text-[#f7f1e8]">
            Descarrega a app
          </h2>
          <p className="mt-2 text-sm text-[#a9b2bf]">
            Acede ao teu plano de corrida em qualquer altura. A app funciona offline e te notifica sobre os teus treinos.
          </p>

          {/* CTA buttons */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={handleDownloadClick}
              className="rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-4 py-3 text-sm font-semibold text-[#111111] shadow-[0_8px_24px_rgba(212,165,79,0.3)] hover:shadow-[0_10px_32px_rgba(212,165,79,0.4)] transition-shadow"
            >
              Instalar App
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-xl border border-[#d4a54f55] px-4 py-3 text-sm font-semibold text-[#f4f6fa] hover:bg-[#1f1f1f] transition-colors"
            >
              Agora Não
            </button>
          </div>

          {installHelp ? (
            <p className="mt-3 rounded-lg border border-[#d4a54f33] bg-[#1a1a1a] px-3 py-2 text-xs text-[#d7deea]">
              {installHelp}
            </p>
          ) : null}

          {/* Info note */}
          <p className="mt-4 text-xs text-[#6b7684]">
            Esta mensagem aparece uma vez por dia. Podes remover a app na qualquer momento no teu dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
}
