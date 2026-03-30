import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AppStoreProvider } from "./store/useAppStore";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);
