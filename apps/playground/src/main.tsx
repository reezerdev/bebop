import React from "react";
import { createRoot } from "react-dom/client";
import { betterAuth as jazzBetterAuth, JazzProvider, useJazzAuth } from "jazz-tools/react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { authClient } from "../auth-client.ts";
import { App } from "./App.tsx";
import { BebopAdminLogin } from "@bebopdev/admin";
import "@bebopdev/admin/styles.css";
import "./index.css";

function AuthPanel() {
  const [leftWritesLocal, setLeftWritesLocal] = React.useState(() => sessionStorage.getItem("bebop-logout-pending-writes") === "true");
  React.useEffect(() => {
    const refresh = () => setLeftWritesLocal(sessionStorage.getItem("bebop-logout-pending-writes") === "true");
    window.addEventListener("bebop-logout-complete", refresh);
    return () => window.removeEventListener("bebop-logout-complete", refresh);
  }, []);
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });

      if (result.error) setError(result.error.message ?? "Could not sign in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <a className="wordmark" href="#top" aria-label="Bebop home">bebop<span>♪</span></a>
      <section className="auth-card">
        {leftWritesLocal && <p className="auth-copy" role="status">Signed out. Jazz could not confirm that every local change synced. Your local data was kept in this browser; sign in with the same account to retry.</p>}
        <p className="eyebrow">YOUR BEBOP ACCOUNT</p>
        <h1>{mode === "sign-up" ? "Save your work." : "Welcome back."}</h1>
        <p className="auth-copy">Sign in with Better Auth to open your Jazz account and start creating.</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "sign-up" && (
            <>
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </>
          )}
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="create-button" type="submit" disabled={submitting}>
            {submitting ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}<span>↗</span>
          </button>
        </form>
        <p className="auth-switch">
          {mode === "sign-up" ? "Already have an account?" : "New to Bebop?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(""); }}>
            {mode === "sign-up" ? "Sign in" : "Create one"}
          </button>
        </p>
      </section>
    </main>
  );
}

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
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? <AdminLoginPanel />
    : <AuthPanel />;
}

function JazzLoading() {
  return <main className="shell"><p className="session-message">Opening your Bebop account…</p></main>;
}

function JazzError({ retry, error }: { retry: () => Promise<void>; error?: Error }) {
  return (
    <main className="shell">
      <p className="session-message" role="alert">Could not open your Bebop account: {error?.message}</p>
      <button className="create-button retry-button" type="button" onClick={() => void retry()}>Try again <span>↗</span></button>
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
