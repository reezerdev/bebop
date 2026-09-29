import React from "react";
import { createRoot } from "react-dom/client";
import { betterAuth as jazzBetterAuth, JazzProvider, useJazzAuth } from "jazz-tools/react";
import { BrowserRouter } from "react-router-dom";
import { authClient } from "../auth-client.ts";
import { App } from "./App.tsx";
import "@bebopdev/admin/styles.css";
import "./index.css";

function AuthPanel() {
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in");
  const [bootstrapAvailable, setBootstrapAvailable] = React.useState<boolean | null>(null);
  const [bootstrapError, setBootstrapError] = React.useState("");
  const [setupChoice, setSetupChoice] = React.useState<"prompt" | "create" | "later">("prompt");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const checkAdminSetup = React.useCallback(() => {
    setBootstrapAvailable(null);
    setBootstrapError("");
    void fetch("/api/bebop/admin-setup", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check whether this app needs its first admin.");
        return response.json() as Promise<{ available?: boolean }>;
      })
      .then((result) => setBootstrapAvailable(result.available === true))
      .catch((cause: unknown) => {
        setBootstrapAvailable(false);
        setBootstrapError(cause instanceof Error ? cause.message : "Could not check admin setup.");
      });
  }, []);

  React.useEffect(() => { checkAdminSetup(); }, [checkAdminSetup]);

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
        {bootstrapAvailable === null ? (
          <>
            <p className="eyebrow">BEBOP SETUP</p>
            <h1>Checking setup.</h1>
            <p className="auth-copy" role="status">Checking whether this app needs its first admin account…</p>
            {bootstrapError && <p className="auth-error" role="alert">{bootstrapError}</p>}
            <button className="auth-secondary-button" type="button" onClick={checkAdminSetup}>Try again</button>
          </>
        ) : bootstrapAvailable && setupChoice === "prompt" ? (
          <>
            <p className="eyebrow">FIRST ADMIN SETUP</p>
            <h1>Create the first admin?</h1>
            <p className="auth-copy">This app has no users yet. The first account will be an administrator and can manage the Bebop admin panel.</p>
            <div className="auth-bootstrap-actions">
              <button className="create-button" type="button" onClick={() => { setSetupChoice("create"); setMode("sign-up"); }}>
                Create first admin<span>↗</span>
              </button>
              <button className="auth-secondary-button" type="button" onClick={() => setSetupChoice("later")}>Not now</button>
            </div>
          </>
        ) : bootstrapAvailable && setupChoice === "later" ? (
          <>
            <p className="eyebrow">FIRST ADMIN SETUP</p>
            <h1>Setup paused.</h1>
            <p className="auth-copy">No account was created. Return here when you are ready to set up the first admin.</p>
            <button className="auth-secondary-button" type="button" onClick={() => setSetupChoice("prompt")}>Set up first admin</button>
          </>
        ) : (
        <>
        <p className="eyebrow">{mode === "sign-up" && setupChoice === "create" ? "FIRST ADMIN SETUP" : "YOUR BEBOP ACCOUNT"}</p>
        <h1>{mode === "sign-up" ? setupChoice === "create" ? "Create your admin account." : "Save your work." : "Welcome back."}</h1>
        <p className="auth-copy">{mode === "sign-up" && setupChoice === "create" ? "This will be the first administrator for your Bebop admin panel." : "Sign in with Better Auth to open your Jazz account and start creating."}</p>
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
            {submitting ? "Working…" : mode === "sign-up" ? setupChoice === "create" ? "Create first admin" : "Create account" : "Sign in"}<span>↗</span>
          </button>
        </form>
        {(!bootstrapAvailable || setupChoice === "create") && <p className="auth-switch">
          {mode === "sign-up" ? "Already have an account?" : "New to Bebop?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(""); }}>
            {mode === "sign-up" ? "Sign in" : "Create one"}
          </button>
        </p>}
        </>
        )}
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
