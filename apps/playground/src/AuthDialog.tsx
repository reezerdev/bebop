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
    <div className="bebop-admin fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm" style={{ colorScheme: "light" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white py-8 text-slate-950 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <Button className="absolute right-3 top-3 rounded-md text-slate-500 normal-case tracking-normal hover:bg-slate-100 hover:text-slate-800" variant="ghost" size="icon-sm" type="button" aria-label="Close sign in" onClick={onClose}>×</Button>
        <div className="px-7 sm:px-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b45d7e]">Your Bebop account</p>
        <h2 id="auth-dialog-title" className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{mode === "sign-up" ? "Start building in sync." : "Welcome back."}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{mode === "sign-up" ? "Create an account to open your own live workspace." : "Sign in to continue to your live playground."}</p>
        <form className="mt-6 grid gap-3" onSubmit={submit}>
          {mode === "sign-up" && (
            <>
              <Label htmlFor="homepage-auth-name" className="normal-case tracking-normal text-slate-700">Name</Label>
              <Input id="homepage-auth-name" className="h-10 rounded-md border border-slate-300 !bg-white px-3 !py-2 !text-slate-950 placeholder:text-slate-400 focus-visible:border-[#b45d7e]" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </>
          )}
          <Label htmlFor="homepage-auth-email" className="normal-case tracking-normal text-slate-700">Email</Label>
          <Input id="homepage-auth-email" className="h-10 rounded-md border border-slate-300 !bg-white px-3 !py-2 !text-slate-950 placeholder:text-slate-400 focus-visible:border-[#b45d7e]" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <Label htmlFor="homepage-auth-password" className="normal-case tracking-normal text-slate-700">Password</Label>
          <Input id="homepage-auth-password" className="h-10 rounded-md border border-slate-300 !bg-white px-3 !py-2 !text-slate-950 placeholder:text-slate-400 focus-visible:border-[#b45d7e]" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required />
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
          <Button className="mt-2 w-full rounded-md bg-[#b45d7e] normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="submit" disabled={submitting}>
            {submitting ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === "sign-up" ? "Already have an account?" : "New to Bebop?"}{" "}
          <Button variant="link" className="h-auto px-0 py-0 text-[#b45d7e] normal-case tracking-normal" type="button" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(""); }}>
            {mode === "sign-up" ? "Sign in" : "Create one"}
          </Button>
        </p>
        </div>
      </Card>
    </div>
  );
}
