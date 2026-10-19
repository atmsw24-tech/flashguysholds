import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The boot screen is plain HTML so it appears before React has loaded.
// Remove it after the app has had a moment to mount, even if a market API is slow.
window.setTimeout(() => {
  const boot = document.getElementById("flashguys-boot");
  if (boot) {
    boot.classList.add("boot-hidden");
    window.setTimeout(() => boot.remove(), 400);
  }
}, 1600);
