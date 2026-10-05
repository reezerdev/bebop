import { useEffect, useState, type FormEvent } from "react";

type Credentials = { email: string; password: string };
type FirstAdminCredentials = { name: string; email: string; password: string };

export type BebopAdminLoginProps = {
  onSubmit: (credentials: Credentials) => void | Promise<void>;
  firstUserSetup?: {
    checkAvailability: () => Promise<boolean>;
    onCreateFirstAdmin: (credentials: FirstAdminCredentials) => void | Promise<void>;
  };
  submitLabel?: string;
};

type SetupStatus = "checking" | "available" | "unavailable" | "error";
type SetupView = "prompt" | "paused" | "create" | "login";

export function BebopAdminLogin({ onSubmit, firstUserSetup, submitLabel = "Log in" }: BebopAdminLoginProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>(firstUserSetup ? "checking" : "unavailable");
  const [setupView, setSetupView] = useState<SetupView>("prompt");
  const [setupError, setSetupError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function checkFirstUserAvailability() {
    if (!firstUserSetup) return;
    setSetupStatus("checking");
    setSetupError("");
    try {
      setSetupStatus((await firstUserSetup.checkAvailability()) ? "available" : "unavailable");
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : "Could not check admin setup.");
      setSetupStatus("error");
    }
  }

  useEffect(() => {
    let active = true;
    if (!firstUserSetup) {
      setSetupStatus("unavailable");
      return;
    }

    setSetupStatus("checking");
    setSetupError("");
    void firstUserSetup.checkAvailability().then((available) => {
      if (active) setSetupStatus(available ? "available" : "unavailable");
    }).catch((cause: unknown) => {
      if (!active) return;
      setSetupError(cause instanceof Error ? cause.message : "Could not check admin setup.");
      setSetupStatus("error");
    });
    return () => { active = false; };
  }, [firstUserSetup?.checkAvailability]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (setupStatus === "available" && setupView === "create" && firstUserSetup) {
        await firstUserSetup.onCreateFirstAdmin({ name: name.trim(), email: email.trim(), password });
        setSetupStatus("unavailable");
        setSetupView("login");
        setNotice("Your admin account has been created. Sign in to continue.");
      } else {
        await onSubmit({ email: email.trim(), password });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : creatingFirstAdmin ? "Could not create first admin." : "Could not log in.");
    } finally {
      setSubmitting(false);
    }
  }

  const creatingFirstAdmin = setupStatus === "available" && setupView === "create";
  const showSetupPrompt = setupStatus === "available" && (setupView === "prompt" || setupView === "paused");
  const showSetupFailure = setupStatus === "error";

  return (
    <main className="bebop-admin flex min-h-svh items-center justify-center bg-background px-5 py-12 font-sans text-foreground">
      <div className="w-full max-w-[360px]">
        <div className="mb-12 flex items-center justify-center gap-3 text-[30px] font-medium tracking-tight">
          <span className="flex size-9 items-center justify-center bg-foreground text-xl font-bold text-background" aria-hidden="true">b</span>
          <span>Bebop</span>
        </div>
        <h1 className="sr-only">Log in to Bebop Admin</h1>

        {setupStatus === "checking" ? (
          <section aria-live="polite">
            <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Admin setup</p>
            <h2 className="mb-3 text-xl font-medium tracking-tight">Checking setup</h2>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">Checking whether this app needs its first admin account…</p>
          </section>
        ) : showSetupPrompt ? (
          <section>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">First admin setup</p>
            <h2 className="mb-3 text-xl font-medium tracking-tight">{setupView === "paused" ? "Setup paused" : "Create the first admin?"}</h2>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
              {setupView === "paused"
                ? "No account was created. Return here when you are ready to set up the first admin."
                : "This app has no users yet. The first account will be an administrator and can manage the Bebop admin panel."}
            </p>
            <div className="flex flex-col items-center gap-4">
              <button className="mt-1 flex h-10 w-full items-center justify-center rounded-none bg-primary px-4 text-xs font-semibold tracking-widest text-primary-foreground uppercase transition-colors hover:bg-primary/80 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" type="button" onClick={() => { setSetupView("create"); setError(""); }}>
                {setupView === "paused" ? "Set up first admin" : "Create first admin"}
              </button>
              <button className="cursor-pointer bg-transparent text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" type="button" onClick={() => setSetupView(setupView === "paused" ? "login" : "paused")}>
                {setupView === "paused" ? "Continue to login" : "Not now"}
              </button>
            </div>
          </section>
        ) : (
          <>
            {creatingFirstAdmin && (
              <section>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">First admin setup</p>
                <h2 className="mb-3 text-xl font-medium tracking-tight">Create your admin account</h2>
                <p className="mb-6 text-sm leading-6 text-muted-foreground">This will be the first administrator for your Bebop admin panel.</p>
              </section>
            )}
            {showSetupFailure && (
              <p className="mb-4 border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert">
                {setupError} <button className="ml-1 cursor-pointer bg-transparent font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" type="button" onClick={() => void checkFirstUserAvailability()}>Try again</button>
              </p>
            )}
            <form className="flex flex-col [&_label]:mb-1.5 [&_label]:text-xs [&_label]:font-medium [&_label_span]:text-destructive [&_input]:mb-5 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-none [&_input]:border [&_input]:border-input [&_input]:bg-muted/50 [&_input]:px-3 [&_input]:text-[13px] [&_input]:text-foreground [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-ring" onSubmit={(event) => void submit(event)}>
              {creatingFirstAdmin && <>
                <label htmlFor="bebop-admin-name">Name <span aria-hidden="true">*</span></label>
                <input
                  id="bebop-admin-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </>}
              <label htmlFor="bebop-admin-email">Email <span aria-hidden="true">*</span></label>
              <input
                id="bebop-admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="bebop-admin-password">Password <span aria-hidden="true">*</span></label>
              <input
                id="bebop-admin-password"
                type="password"
                autoComplete={creatingFirstAdmin ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={creatingFirstAdmin ? 8 : undefined}
                required
              />
              {error && <p className="mb-4 border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert">{error}</p>}
              <button className="mt-1 flex h-10 w-full items-center justify-center rounded-none bg-primary px-4 text-xs font-semibold tracking-widest text-primary-foreground uppercase transition-colors hover:bg-primary/80 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" type="submit" disabled={submitting}>
                {submitting ? "Working…" : creatingFirstAdmin ? "Create first admin" : submitLabel}
              </button>
            </form>
            {creatingFirstAdmin && <p className="mt-6 text-center text-xs text-muted-foreground [&_button]:cursor-pointer [&_button]:bg-transparent [&_button]:p-0 [&_button]:font-semibold [&_button]:text-foreground [&_button:hover]:underline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-ring">
              Already have an account?{" "}
              <button type="button" onClick={() => { setSetupView("login"); setError(""); }}>Log in</button>
            </p>}
            {setupStatus === "available" && setupView === "login" && <p className="mt-6 text-center text-xs text-muted-foreground [&_button]:cursor-pointer [&_button]:bg-transparent [&_button]:p-0 [&_button]:font-semibold [&_button]:text-foreground [&_button:hover]:underline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-ring">
              First admin setup is available.{" "}
              <button type="button" onClick={() => { setSetupView("prompt"); setError(""); }}>Set up first admin</button>
            </p>}
          </>
        )}
        {notice && <p className="mt-4 border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground" role="status">{notice}</p>}
      </div>
    </main>
  );
}
