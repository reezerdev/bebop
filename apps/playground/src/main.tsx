import React from "react";
import { createRoot } from "react-dom/client";
import { JazzSessionProvider, useJazzSession } from "jazz-tools/react";
import { App } from "./App.tsx";
import "./index.css";

function SessionFallback() {
  const session = useJazzSession();

  if (session.status === "error") {
    return (
      <main className="shell">
        <p role="alert">Could not open the local Bebop database: {session.error?.message}</p>
        <button type="button" onClick={() => void session.retry()}>Try again</button>
      </main>
    );
  }

  return <main className="shell"><p>Opening your local Bebop database…</p></main>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JazzSessionProvider
      config={{
        appId: import.meta.env.VITE_JAZZ_APP_ID,
        serverUrl: import.meta.env.VITE_JAZZ_SERVER_URL,
        initial: "local-first",
      }}
      fallback={<SessionFallback />}
    >
      <App />
    </JazzSessionProvider>
  </React.StrictMode>,
);
