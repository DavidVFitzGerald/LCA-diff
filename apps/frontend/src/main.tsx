import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Bootstrap } from "./app/Bootstrap";

const root = document.getElementById("root");
if (!root) throw new Error("Frontend mount target #root is missing");

createRoot(root).render(
  <StrictMode>
    <Bootstrap mode={import.meta.env.VITE_SERVICE_MODE} />
  </StrictMode>,
);
