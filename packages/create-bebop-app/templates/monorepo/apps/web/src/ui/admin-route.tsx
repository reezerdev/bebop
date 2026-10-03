import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { betterAuth as jazzBetterAuth, JazzProvider, useDb } from "jazz-tools/react";
import { BebopAdmin, BebopAdminLogin } from "@bebopdev/admin";
import { BrowserRouter, Route as RouterRoute, Routes } from "react-router-dom";
import { app } from "../../bebop-generated-schema.js";
import { bebopAdminManifest } from "../../bebop-admin-manifest.js";
import { createBebopClient } from "../../bebop-generated-client.js";
import { authClient } from "../../auth-client.js";

async function checkFirstAdminAvailability() {
  const response = await fetch("/api/bebop/admin-setup", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Could not check whether this app needs its first admin.");
  const result = await response.json() as { available?: boolean };
  return result.available === true;
}

async function submitCredentials({ email, password }: { email: string; password: string }) {
  const result = await authClient.signIn.email({ email, password });
  if (result.error) throw new Error(result.error.message ?? "Could not sign in.");
}

async function createFirstAdmin({ name, email, password }: { name: string; email: string; password: string }) {
  const result = await authClient.signUp.email({ name, email, password });
  if (result.error) throw new Error(result.error.message ?? "Could not create the first admin.");
}

const firstUserSetup = {
  checkAvailability: checkFirstAdminAvailability,
  onCreateFirstAdmin: createFirstAdmin,
};

export function AdminRoute() {
  return <ClientOnly fallback={<AdminStatus>Opening the admin…</AdminStatus>}><AdminAuth /></ClientOnly>;
}

function AdminAuth() {
  const session = authClient.useSession();
  if (session.isPending) return <AdminStatus>Checking your sign-in…</AdminStatus>;
  if (!session.data?.user) {
    return (
      <BebopAdminLogin
        onSubmit={submitCredentials}
        firstUserSetup={firstUserSetup}
      />
    );
  }

  return (
    <JazzProvider
      appId={import.meta.env.VITE_JAZZ_APP_ID}
      serverUrl={import.meta.env.VITE_JAZZ_SERVER_URL}
      auth={jazzBetterAuth(authClient)}
      signedOut={<BebopAdminLogin onSubmit={submitCredentials} firstUserSetup={firstUserSetup} />}
      loading={<AdminStatus>Opening your authenticated Jazz session…</AdminStatus>}
      autoAttachDevTools={false}
    >
      <AdminAccessCheck user={session.data.user} />
    </JazzProvider>
  );
}

function AdminAccessCheck({ user }: { user: { id: string; name?: string | null; email?: string | null } }) {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied" | "error">("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setAccess("checking");
    void fetch("/api/bebop/admin-access", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { allowed?: boolean };
        if (active) setAccess(response.ok && result.allowed ? "allowed" : response.status === 401 || response.status === 403 ? "denied" : "error");
      })
      .catch(() => { if (active) setAccess("error"); });
    return () => { active = false; };
  }, [user.id, attempt]);

  if (access === "checking") return <AdminStatus>Checking administrator access…</AdminStatus>;
  if (access === "denied") {
    return (
      <AdminStatus>
        <p role="alert">Your account is signed in, but it does not have administrator access.</p>
        <AdminAction onClick={() => void authClient.signOut()}>Sign out</AdminAction>
      </AdminStatus>
    );
  }
  if (access === "error") {
    return (
      <AdminStatus>
        <p role="alert">Could not verify administrator access. Try again.</p>
        <AdminAction onClick={() => { setAccess("checking"); setAttempt((value) => value + 1); }}>Retry</AdminAction>
      </AdminStatus>
    );
  }

  return <AuthenticatedAdmin user={user} />;
}

function AuthenticatedAdmin({ user }: { user: { id: string; name?: string | null; email?: string | null } }) {
  const db = useDb();
  const client = useMemo(() => createBebopClient(db), [db]);
  return (
    <BrowserRouter>
      <Routes>
        <RouterRoute
          path="/admin/*"
          element={
            <BebopAdmin
              app={app}
              client={client}
              manifest={bebopAdminManifest}
              canAccessAdmin
              canManageUsers
              authClient={authClient}
              user={{ name: user.name ?? undefined, email: user.email ?? undefined }}
              onLogout={async () => { await authClient.signOut(); }}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function AdminStatus({ children }: { children: ReactNode }) {
  return <main className="bebop-admin grid min-h-svh place-items-center gap-4 bg-background px-6 font-sans text-muted-foreground">{children}</main>;
}

function AdminAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="h-10 border border-border bg-primary px-4 text-xs font-semibold tracking-widest text-primary-foreground uppercase" type="button" onClick={onClick}>{children}</button>;
}
