import type { CSSProperties } from "react";

export const planocorridaPageStyle: CSSProperties = {
  backgroundColor: "#090909",
  backgroundImage: [
    "linear-gradient(180deg, rgba(10, 10, 10, 0.62), rgba(6, 6, 6, 0.86))",
    "radial-gradient(circle at 50% 20%, rgba(212, 165, 79, 0.18), transparent 45%)",
    "url('/assets/img/TP_Coach.jpg')",
  ].join(", "),
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
};

export const planocorridaPanelStyle: CSSProperties = {
  backgroundColor: "rgba(12, 12, 12, 0.94)",
  backgroundImage: [
    "linear-gradient(180deg, rgba(24, 24, 24, 0.92), rgba(10, 10, 10, 0.97))",
    "radial-gradient(circle at top left, rgba(212, 165, 79, 0.12), transparent 38%)",
    "radial-gradient(circle at bottom right, rgba(22, 102, 216, 0.14), transparent 34%)",
  ].join(", "),
};

export const planocorridaSoftPanelStyle: CSSProperties = {
  backgroundColor: "rgba(16, 16, 16, 0.9)",
  backgroundImage: [
    "linear-gradient(180deg, rgba(26, 26, 26, 0.9), rgba(10, 10, 10, 0.96))",
    "radial-gradient(circle at 15% 0, rgba(212, 165, 79, 0.1), transparent 30%)",
  ].join(", "),
};