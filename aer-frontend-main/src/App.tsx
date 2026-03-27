import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import PlanForm from "./pages/plan-form";
import PlanEntry from "./pages/plan-entry";
import AiAssistantFab from "./components/ai-assistant-fab";
import AiAssistantChat from "./components/ai-assistant-chat";

const AtletaPage = lazy(() => import("./pages/atleta/index"));
const ForcaPage = lazy(() => import("./pages/atleta/forca"));

function CoachHtmlRedirect() {
  useEffect(() => {
    window.location.replace("/coach/");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
    </div>
  );
}

function App() {
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);

  return (
    <main className="min-h-screen bg-transparent text-[#e4e8ef]">
      <Routes>
        <Route path="/" element={<PlanEntry />} />
        <Route path="/formulario" element={<PlanForm />} />
        <Route path="/formlario" element={<PlanForm />} />
        <Route path="/atleta" element={
          <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
            </div>
          }>
            <AtletaPage />
          </Suspense>
        } />
        <Route path="/coach" element={<CoachHtmlRedirect />} />
        <Route
          path="/atleta/forca"
          element={
            <Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                </div>
              }
            >
              <ForcaPage />
            </Suspense>
          }
        />
        <Route path="/coach/forca" element={<CoachHtmlRedirect />} />
      </Routes>
      <AiAssistantFab
        isOpen={isAiChatOpen}
        onActivate={() => setIsAiChatOpen((current) => !current)}
      />
      <AiAssistantChat isOpen={isAiChatOpen} onClose={() => setIsAiChatOpen(false)} />
    </main>
  );
}

export default App;
