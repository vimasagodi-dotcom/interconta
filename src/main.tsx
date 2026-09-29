import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root")!;

// Helper to handle dynamic viewport height on mobile browsers
const setVh = () => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
};

setVh();
window.addEventListener("resize", setVh);
window.addEventListener("orientationchange", setVh);

createRoot(root).render(<App />);
