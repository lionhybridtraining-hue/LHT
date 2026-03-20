import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import PlanForm from "./pages/plan-form";
import AiAssistantFab from "./components/ai-assistant-fab";
import AiAssistantChat from "./components/ai-assistant-chat";

function App() {
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);

  return (
    <main className="min-h-screen bg-transparent text-[#e4e8ef]">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/formulario" element={<PlanForm />} />
        <Route path="/formlario" element={<PlanForm />} />
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
