import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb, useJazzAuth } from "jazz-tools/react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BebopAdmin } from "@bebopdev/admin";
import { createBebopFetchTransport } from "@bebopdev/core";
import { authClient } from "../auth-client.ts";
import { app } from "../bebop-generated-schema.js";
import { bebopAdminManifest } from "../bebop-admin-manifest.js";
import { createBebopClient } from "../bebop-generated-client.js";
import { Homepage } from "./Homepage.tsx";
import { PlaygroundWidget } from "./PlaygroundPage.tsx";
import { signOutWithLocalFallback } from "./logout.js";

export function App() {
  const { logout } = useJazzAuth();
  const { pathname } = useLocation();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
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
  const currentUserEmail = authSession?.user.email?.trim() ?? "";
  const currentUserImage = authSession?.user.image ?? "";
  const bebop = useMemo(() => createBebopClient(db, {
    commandTransport: createBebopFetchTransport({ basePath: "/api/bebop" }),
  }), [db]);
  const [canAccessAdmin, setCanAccessAdmin] = useState<boolean | null>(null);
  const [canManageUsers, setCanManageUsers] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isAdminRoute) {
      setCanAccessAdmin(false);
      return () => { active = false; };
    }
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
  }, [currentUserId, isAdminRoute, isAuthPending]);

  useEffect(() => {
    let active = true;
    setCanManageUsers(false);
    if (!isAdminRoute || !currentUserId || canAccessAdmin !== true) return () => { active = false; };

    void authClient.admin.listUsers({ query: { limit: 1, offset: 0 } })
      .then((response) => {
        if (active) setCanManageUsers(Boolean(response.data) && !response.error);
      })
      .catch(() => {
        if (active) setCanManageUsers(false);
      });

    return () => { active = false; };
  }, [canAccessAdmin, currentUserId, isAdminRoute]);

  const authorOptions = useMemo(() => {
    const current = currentUserId ? [{ id: currentUserId, name: currentUserName || "Current user" }] : [];
    return current;
  }, [currentUserId, currentUserName]);
  const loadUserRelationOptions = useCallback(async ({ ids, search, limit, offset }: { ids?: readonly string[]; search: string; limit: number; offset: number }) => {
    if (ids?.length) {
      const query = new URLSearchParams();
      ids.forEach((id) => query.append("id", id));
      const response = await fetch(`/api/bebop/users?${query.toString()}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`User lookup failed (${response.status}).`);
      const options = await response.json() as { id: string; name: string }[];
      const knownIds = new Set(options.map((option) => option.id));
      const missingUsers = await Promise.all(ids.filter((id) => !knownIds.has(id)).map(async (id) => {
        const result = await authClient.admin.getUser({ query: { id } });
        const user = result.data;
        return result.error || !user ? undefined : { id: user.id, name: String(user.name ?? user.email ?? user.id) };
      }));
      return {
        options: [...options, ...missingUsers.filter((option): option is { id: string; name: string } => option !== undefined)],
        hasMore: false,
      };
    }
    const response = await authClient.admin.listUsers({
      query: {
        limit,
        offset,
        sortBy: "name",
        sortDirection: "asc",
        ...(search ? { searchValue: search, searchField: "name" as const, searchOperator: "contains" as const } : {}),
      },
    });
    if (response.error) throw new Error(response.error.message || "Better Auth could not search users.");
    const users = response.data?.users ?? [];
    return {
      options: users.map((user) => ({ id: user.id, name: String(user.name ?? user.email ?? user.id) })),
      hasMore: offset + users.length < (response.data?.total ?? 0),
    };
  }, []);
  const relationOptionLoaders = useMemo(() => ({ users: loadUserRelationOptions }), [loadUserRelationOptions]);
  const preflightRelatedWrite = useCallback((collectionSlug: string) =>
    collectionSlug === "channels" ? "unknown" : undefined,
  []);
  const createDefaults = useMemo(() => ({
    channels: { author: currentUserId, visibility: "public" },
    streams: { author: currentUserId },
    entries: { author: currentUserId, type: "message" },
    streamMemberships: { user: currentUserId, role: "member" },
    workspaceMemberships: { user: currentUserId, role: "member", status: "active" },
  }), [currentUserId]);

  return <Routes>
    <Route path="/" element={
      <Homepage>
        <PlaygroundWidget mode="live" client={bebop} currentUserId={currentUserId} currentUserName={currentUserName} currentUserEmail={currentUserEmail} currentUserImage={currentUserImage} authors={authorOptions} onLogout={signOut} />
      </Homepage>
    } />
    <Route
      path="/admin/*"
      element={canAccessAdmin === null
        ? <main className="bebop-admin grid min-h-svh place-items-center bg-background px-6 text-foreground"><p role="status">Checking admin access…</p></main>
        : <BebopAdmin app={app} client={bebop} manifest={bebopAdminManifest} canAccessAdmin={canAccessAdmin} canManageUsers={canManageUsers} authClient={authClient} user={{ name: authSession?.user.name, email: authSession?.user.email }} createDefaults={createDefaults} preflightCreate={preflightRelatedWrite} preflightUpdate={preflightRelatedWrite} relationOptionLoaders={relationOptionLoaders} onLogout={signOut} />}
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
