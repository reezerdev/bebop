import { useEffect, useMemo, useState } from "react";
import { useDb, useJazzAuth } from "jazz-tools/react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BebopAdmin } from "@bebop/admin";
import { authClient } from "../auth-client.ts";
import { app } from "../bebop-generated-schema.js";
import { bebopAdminManifest } from "../bebop-admin-manifest.js";
import { createBebopClient } from "../bebop-generated-client.js";
import { PlaygroundPage } from "./PlaygroundPage.tsx";

export function App() {
  const { logout } = useJazzAuth();
  const db = useDb();
  const bebop = useMemo(() => createBebopClient(db), [db]);
  const { data: authSession } = authClient.useSession();
  const currentUserId = authSession?.user.id ?? "";
  const currentUserName = authSession?.user.name?.trim() ?? "";
  const [users, setUsers] = useState<readonly { id: string; name: string }[]>([]);

  useEffect(() => {
    setUsers([]);
    if (!currentUserId) {
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
  }, [currentUserId]);

  const authorOptions = useMemo(() => {
    const current = currentUserId ? [{ id: currentUserId, name: currentUserName || "Current user" }] : [];
    return [...current, ...users.filter((user) => user.id !== currentUserId)];
  }, [currentUserId, currentUserName, users]);
  const relationOptions = useMemo(() => ({ better_auth_user: authorOptions }), [authorOptions]);
  const createDefaults = useMemo(() => ({
    tasks: { author: currentUserId, assignee: currentUserId, status: "todo" },
    workspaceMemberships: { user: currentUserId, role: "member", status: "active" },
  }), [currentUserId]);

  return <Routes>
    <Route path="/" element={<PlaygroundPage client={bebop} logout={() => logout()} currentUserId={currentUserId} currentUserName={currentUserName} authors={authorOptions} />} />
    <Route path="/admin/*" element={<BebopAdmin app={app} client={bebop} manifest={bebopAdminManifest} canAccessAdmin={Boolean(authSession?.user)} user={{ name: authSession?.user.name, email: authSession?.user.email }} createDefaults={createDefaults} relationOptions={relationOptions} onLogout={() => logout()} />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
