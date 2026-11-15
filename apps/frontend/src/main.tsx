import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Bootstrap } from "./app/Bootstrap";
import "./app/fonts.css";

const root = document.getElementById("root");
if (!root) throw new Error("Frontend mount target #root is missing");

createRoot(root).render(
  <StrictMode>
    <Bootstrap
      mode={import.meta.env.VITE_SERVICE_MODE}
      scenario={new URLSearchParams(window.location.search).get(
        "mock-scenario",
      )}
    />
  </StrictMode>,
);
