import { Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import PlanForm from "./pages/plan-form";

function App() {
  return (
    <main className="h-lvh">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/formulario" element={<PlanForm />} />
      </Routes>
    </main>
  );
}

export default App;
