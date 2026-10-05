import React from "react";
import { createRoot } from "react-dom/client";
import { betterAuth as jazzBetterAuth, JazzProvider, useJazzAuth } from "jazz-tools/react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { authClient } from "../auth-client.ts";
import { App } from "./App.tsx";
import { BebopAdminLogin, Button } from "@bebopdev/admin";
import { Homepage } from "./Homepage.tsx";
import { PlaygroundWidget } from "./PlaygroundPage.tsx";
import "@bebopdev/admin/styles.css";
import "./tailwind.css";

async function checkFirstAdminAvailability() {
  const response = await fetch("/api/bebop/admin-setup", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Could not check whether this app needs its first admin.");
  const result = await response.json() as { available?: boolean };
  return result.available === true;
}

function AdminLoginPanel() {
  return (
    <BebopAdminLogin
      onSubmit={async ({ email, password }) => {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message ?? "Could not sign in.");
      }}
      firstUserSetup={{
        checkAvailability: checkFirstAdminAvailability,
        onCreateFirstAdmin: async ({ name, email, password }) => {
          const result = await authClient.signUp.email({ name, email, password });
          if (result.error) throw new Error(result.error.message ?? "Could not create first admin.");
        },
      }}
    />
  );
}

function SignedOutPage() {
  const { pathname } = useLocation();
  const [leftWritesLocal, setLeftWritesLocal] = React.useState(() => sessionStorage.getItem("bebop-logout-pending-writes") === "true");
  React.useEffect(() => {
    const refresh = () => setLeftWritesLocal(sessionStorage.getItem("bebop-logout-pending-writes") === "true");
    window.addEventListener("bebop-logout-complete", refresh);
    return () => window.removeEventListener("bebop-logout-complete", refresh);
  }, []);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <AdminLoginPanel />;

  return (
    <Homepage>
      <PlaygroundWidget
        mode="preview"
        notice={leftWritesLocal ? "Signed out. Jazz could not confirm that every local change synced. Your local data was kept in this browser; sign in with the same account to retry." : undefined}
      />
    </Homepage>
  );
}

function JazzLoading() {
  return <main className="bebop-admin grid min-h-svh place-items-center bg-card px-6 text-muted-foreground"><p role="status">Opening your Bebop account…</p></main>;
}

function JazzError({ retry, error }: { retry: () => Promise<void>; error?: Error }) {
  return (
    <main className="bebop-admin grid min-h-svh place-items-center gap-4 bg-card px-6 text-muted-foreground">
      <p role="alert">Could not open your Bebop account: {error?.message}</p>
      <Button className="rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="button" onClick={() => void retry()}>Try again ↗</Button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <JazzProvider
        appId={import.meta.env.VITE_JAZZ_APP_ID}
        serverUrl={import.meta.env.VITE_JAZZ_SERVER_URL}
        auth={jazzBetterAuth(authClient)}
        signedOut={<SignedOutPage />}
        loading={<JazzLoading />}
        error={(state) => <JazzError retry={state.retry} error={state.error} />}
      >
        <App />
      </JazzProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
