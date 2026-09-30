import { useState, type FormEvent } from "react";

export type BebopAdminLoginProps = {
  onSubmit: (credentials: { email: string; password: string }) => void | Promise<void>;
  submitLabel?: string;
};

export function BebopAdminLogin({ onSubmit, submitLabel = "Log in" }: BebopAdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await onSubmit({ email: email.trim(), password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="bebop-admin admin-login">
      <div className="admin-login-content">
        <div className="admin-login-brand">
          <span className="admin-login-brand-mark" aria-hidden="true">b</span>
          <span>Bebop</span>
        </div>
        <h1 className="admin-login-sr-only">Log in to Bebop Admin</h1>
        <form className="admin-login-form" onSubmit={(event) => void submit(event)}>
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button className="admin-login-submit" type="submit" disabled={submitting}>
            {submitting ? "Working…" : submitLabel}
          </button>
        </form>
      </div>
    </main>
  );
}
