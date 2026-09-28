import React from "react";
import { createRoot } from "react-dom/client";
import { JazzProvider } from "jazz-tools/react";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import "@bebop/admin/styles.css";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JazzProvider
      appId={import.meta.env.VITE_JAZZ_APP_ID}
      serverUrl={import.meta.env.VITE_JAZZ_SERVER_URL}
      autoAttachDevTools={false}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </JazzProvider>
  </React.StrictMode>,
);
