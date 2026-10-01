import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb, useJazzAuth } from "jazz-tools/react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BebopAdmin } from "@bebopdev/admin";
import { createBebopFetchTransport } from "@bebopdev/core";
import { authClient } from "../auth-client.ts";
import { app } from "../bebop-generated-schema.js";
import { bebopAdminManifest } from "../bebop-admin-manifest.js";
import { createBebopClient } from "../bebop-generated-client.js";
import { PlaygroundPage } from "./PlaygroundPage.tsx";
import { withStreamCollections } from "./stream-client.js";
import { withAcyclicTaskParents } from "./task-parent.js";
import { signOutWithLocalFallback } from "./logout.js";

export function App() {
  const { logout } = useJazzAuth();
  const db = useDb();
  const signOut = useCallback(async () => {
    const leftWritesLocal = await signOutWithLocalFallback(logout, db);
    if (leftWritesLocal) sessionStorage.setItem("bebop-logout-pending-writes", "true");
    else sessionStorage.removeItem("bebop-logout-pending-writes");
    window.dispatchEvent(new Event("bebop-logout-complete"));
  }, [db, logout]);
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const currentUserId = authSession?.user.id ?? "";
  const currentUserName = authSession?.user.name?.trim() ?? "";
  const bebop = useMemo(() => withAcyclicTaskParents(withStreamCollections(createBebopClient(db, {
    commandTransport: createBebopFetchTransport({ basePath: "/api/bebop" }),
  }), db, currentUserId)), [db, currentUserId]);
  const [canAccessAdmin, setCanAccessAdmin] = useState<boolean | null>(null);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [users, setUsers] = useState<readonly { id: string; name: string }[]>([]);

  useEffect(() => {
    let active = true;
    if (isAuthPending) {
      setCanAccessAdmin(null);
      return () => { active = false; };
    }
    setCanAccessAdmin(null);
    if (!currentUserId) {
      setCanAccessAdmin(false);
      return () => { active = false; };
    }

    void fetch("/api/bebop/admin-access", { credentials: "same-origin" })
      .then(async (response) => {
        const result = await response.json() as { allowed?: boolean };
        if (active) setCanAccessAdmin(response.ok && result.allowed === true);
      })
      .catch(() => {
        if (active) setCanAccessAdmin(false);
      });

    return () => { active = false; };
  }, [currentUserId, isAuthPending]);

  useEffect(() => {
    let active = true;
    setCanManageUsers(false);
    if (!currentUserId) return () => { active = false; };

    void authClient.admin.listUsers({ query: { limit: 1, offset: 0 } })
      .then((response) => {
        if (active) setCanManageUsers(Boolean(response.data) && !response.error);
      })
      .catch(() => {
        if (active) setCanManageUsers(false);
      });

    return () => { active = false; };
  }, [currentUserId]);

  useEffect(() => {
    setUsers([]);
    if (!currentUserId || canAccessAdmin !== true) {
      return;
    }
    const controller = new AbortController();
    void fetch("/api/bebop/users", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Author lookup failed (${response.status}).`);
        return response.json() as Promise<{ id: string; name: string }[]>;
      })
      .then(setUsers)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Could not load authors:", error);
      });
    return () => controller.abort();
  }, [canAccessAdmin, currentUserId]);

  const authorOptions = useMemo(() => {
    const current = currentUserId ? [{ id: currentUserId, name: currentUserName || "Current user" }] : [];
    return canAccessAdmin ? [...current, ...users.filter((user) => user.id !== currentUserId)] : current;
  }, [canAccessAdmin, currentUserId, currentUserName, users]);
  const relationOptions = useMemo(() => ({ users: authorOptions }), [authorOptions]);
  const preflightRelatedWrite = useCallback((collectionSlug: string) =>
    collectionSlug === "tasks" || collectionSlug === "channels" ? "unknown" : undefined,
  []);
  const createDefaults = useMemo(() => ({
    tasks: { author: currentUserId, assignee: currentUserId, status: "todo", visibility: "public" },
    channels: { author: currentUserId, visibility: "public" },
    streams: { author: currentUserId },
    entries: { author: currentUserId, type: "message" },
    streamMemberships: { user: currentUserId, role: "member" },
    workspaceMemberships: { user: currentUserId, role: "member", status: "active" },
  }), [currentUserId]);

  return <Routes>
    <Route path="/" element={<PlaygroundPage client={bebop} logout={signOut} currentUserId={currentUserId} currentUserName={currentUserName} authors={authorOptions} />} />
    <Route
      path="/admin/*"
      element={canAccessAdmin === null
        ? <main className="bebop-admin grid min-h-svh place-items-center bg-background px-6 text-foreground"><p role="status">Checking admin access…</p></main>
        : <BebopAdmin app={app} client={bebop} manifest={bebopAdminManifest} canAccessAdmin={canAccessAdmin} canManageUsers={canManageUsers} authClient={authClient} user={{ name: authSession?.user.name, email: authSession?.user.email }} createDefaults={createDefaults} preflightCreate={preflightRelatedWrite} preflightUpdate={preflightRelatedWrite} relationOptions={relationOptions} onLogout={signOut} />}
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
