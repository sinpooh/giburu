import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { initFirebase } from "./firebase";
import { App } from "./App";
import "./styles.css";

registerSW({ immediate: true });

initFirebase().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
