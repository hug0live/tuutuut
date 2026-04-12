import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AppStoreProvider } from "./store/useAppStore";
import "./styles/app.css";

const APP_UPDATE_EVENT = "tuutuut:update-status";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__APP_LAST_UPDATED_AT__)}`;

    void navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: import.meta.env.BASE_URL
    }).then((registration) => {
      let shouldReloadForUpdate = false;
      let isReloading = false;

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;

        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            shouldReloadForUpdate = true;
            window.dispatchEvent(
              new CustomEvent(APP_UPDATE_EVENT, {
                detail: "Mise à jour détectée. Préparation du rechargement complet..."
              })
            );
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!shouldReloadForUpdate || isReloading) {
          return;
        }

        isReloading = true;
        window.dispatchEvent(
          new CustomEvent(APP_UPDATE_EVENT, {
            detail: "Nouvelle version installée. Rechargement complet de l'application..."
          })
        );

        window.setTimeout(() => {
          window.location.reload();
        }, 1200);
      });
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
