import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AppStoreProvider } from "./store/useAppStore";
import "./styles/app.css";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);
