import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Input, Label } from "@bebopdev/admin";
import { authClient } from "../auth-client.ts";

export type AuthIntent = "sign-in" | "sign-up";

export function AuthDialog({ intent, onClose }: { intent: AuthIntent; onClose: () => void }) {
  const [mode, setMode] = useState<AuthIntent>(intent);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setMode(intent), [intent]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
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
    <div className="bebop-admin fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="relative w-full max-w-md rounded-none border border-border bg-card py-8 text-foreground shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <Button className="absolute right-3 top-3 rounded-none text-muted-foreground normal-case tracking-normal hover:bg-secondary hover:text-foreground" variant="ghost" size="icon-sm" type="button" aria-label="Close sign in" onClick={onClose}>×</Button>
        <div className="px-7 sm:px-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your Bebop account</p>
        <h2 id="auth-dialog-title" className="mt-3 text-2xl font-heading font-semibold tracking-wider text-foreground">{mode === "sign-up" ? "Start building in sync." : "Welcome back."}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "sign-up" ? "Create an account to open your own live workspace." : "Sign in to continue to your live playground."}</p>
        <form className="mt-6 grid gap-3" onSubmit={submit}>
          {mode === "sign-up" && (
            <>
              <Label htmlFor="homepage-auth-name" className="normal-case tracking-normal text-muted-foreground">Name</Label>
              <Input id="homepage-auth-name" className="h-10 rounded-none border border-input !bg-card px-3 !py-2 !text-foreground placeholder:text-muted-foreground focus-visible:border-ring" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </>
          )}
          <Label htmlFor="homepage-auth-email" className="normal-case tracking-normal text-muted-foreground">Email</Label>
          <Input id="homepage-auth-email" className="h-10 rounded-none border border-input !bg-card px-3 !py-2 !text-foreground placeholder:text-muted-foreground focus-visible:border-ring" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <Label htmlFor="homepage-auth-password" className="normal-case tracking-normal text-muted-foreground">Password</Label>
          <Input id="homepage-auth-password" className="h-10 rounded-none border border-input !bg-card px-3 !py-2 !text-foreground placeholder:text-muted-foreground focus-visible:border-ring" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required />
          {error && <p className="rounded-none border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
          <Button className="mt-2 w-full rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="submit" disabled={submitting}>
            {submitting ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "sign-up" ? "Already have an account?" : "New to Bebop?"}{" "}
          <Button variant="link" className="h-auto px-0 py-0 text-primary normal-case tracking-normal" type="button" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(""); }}>
            {mode === "sign-up" ? "Sign in" : "Create one"}
          </Button>
        </p>
        </div>
      </Card>
    </div>
  );
}
