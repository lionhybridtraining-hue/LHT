import { useLocation } from "react-router-dom";
import Home from "./home";
import PlanLanding from "./plan-landing";

const PLAN_QUERY_KEYS = [
  "progression_rate",
  "phase_duration",
  "training_frequency",
  "program_distance",
];

export default function PlanEntry() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const hasPlanParams = PLAN_QUERY_KEYS.every((key) => {
    const value = params.get(key);
    return value !== null && value.trim() !== "";
  });

  return hasPlanParams ? <Home /> : <PlanLanding />;
}