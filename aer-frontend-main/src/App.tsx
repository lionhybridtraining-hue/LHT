import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import PlanForm from "./pages/plan-form";
import PlanEntry from "./pages/plan-entry";
import Home from "./pages/home";
import AiAssistantFab from "./components/ai-assistant-fab";
import AiAssistantChat from "./components/ai-assistant-chat";
import AthleteLayout from "./components/atleta/AthleteLayout";

const AtletaPage = lazy(() => import("./pages/atleta/index"));
const ForcaPage = lazy(() => import("./pages/atleta/forca"));
const AtletaLoginPage = lazy(() => import("./pages/atleta/login"));
const AtletaProgramasPage = lazy(() => import("./pages/atleta/programas"));
const AtletaPerfilPage = lazy(() => import("./pages/atleta/perfil"));
const CalendarioPage = lazy(() => import("./pages/atleta/calendario"));

const LazyFallback = (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
  </div>
);

function App() {
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);

  return (
    <main className="min-h-screen bg-transparent text-[#e4e8ef]">
      <Routes>
        <Route path="/" element={<PlanEntry />} />
        <Route path="/atleta/onboarding" element={<PlanEntry />} />
        <Route path="/atleta/onboarding-intake" element={<PlanEntry />} />
        <Route path="/atleta/onboarding/formulario" element={<PlanForm />} />

        {/* Legacy aliases */}
        <Route path="/formulario" element={<Navigate to="/atleta/onboarding/formulario" replace />} />
        <Route path="/formlario" element={<Navigate to="/atleta/onboarding/formulario" replace />} />

        {/* Login — standalone, no layout shell */}
        <Route
          path="/atleta/login"
          element={<Suspense fallback={LazyFallback}><AtletaLoginPage /></Suspense>}
        />

        {/* Authenticated athlete pages — shared layout with bottom nav */}
        <Route path="/atleta" element={<AthleteLayout />}>
          <Route index element={<Suspense fallback={LazyFallback}><AtletaPage /></Suspense>} />
          <Route path="forca" element={<Suspense fallback={LazyFallback}><ForcaPage /></Suspense>} />
          <Route path="plano" element={<Home />} />
          <Route path="programas" element={<Suspense fallback={LazyFallback}><AtletaProgramasPage /></Suspense>} />
          <Route path="calendario" element={<Suspense fallback={LazyFallback}><CalendarioPage /></Suspense>} />
          <Route path="perfil" element={<Suspense fallback={LazyFallback}><AtletaPerfilPage /></Suspense>} />
        </Route>
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
