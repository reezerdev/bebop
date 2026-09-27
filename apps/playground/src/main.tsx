import React from "react";
import { createRoot } from "react-dom/client";
import { betterAuth as jazzBetterAuth, JazzProvider, useJazzAuth } from "jazz-tools/react";
import { BrowserRouter } from "react-router-dom";
import { authClient } from "../auth-client.ts";
import { App } from "./App.tsx";
import "@bebop/admin/styles.css";
import "./index.css";

function AuthPanel() {
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-up");
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
        signedOut={<AuthPanel />}
        loading={<JazzLoading />}
        error={(state) => <JazzError retry={state.retry} error={state.error} />}
      >
        <App />
      </JazzProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
