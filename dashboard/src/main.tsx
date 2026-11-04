import { MotionConfig } from "framer-motion";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./App";

// Follow the viewer's theme: an explicit data-theme on <html> wins, otherwise the system setting.
// The kit switches its tokens on the `dark` class.
const media = window.matchMedia("(prefers-color-scheme: dark)");
const syncTheme = () => {
  const root = document.documentElement;
  const set = root.getAttribute("data-theme");
  root.classList.toggle("dark", set ? set === "dark" : media.matches);
};
syncTheme();
media.addEventListener("change", syncTheme);
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
