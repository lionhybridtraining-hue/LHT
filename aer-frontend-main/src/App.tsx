import { Route, Routes } from "react-router-dom";
import Home from "./pages/home";

function App() {
  return (
    <main className="h-lvh">
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </main>
  );
}

export default App;
