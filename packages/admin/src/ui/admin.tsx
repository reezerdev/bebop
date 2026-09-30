import { useEffect, useState } from "react";
import { useParams, useRoutes, useSearchParams } from "react-router-dom";
import type { BebopAdminManifest } from "../types.js";
import { NotFoundPage } from "./admin/components/common.js";
import { AdminLayout } from "./admin/pages/layout.js";
import { DashboardPage } from "./admin/pages/dashboard.js";
import { AuthUsersList } from "./admin/pages/auth-users-list.js";
import { AuthUserCreate, AuthUserEditor } from "./admin/pages/auth-user-editor.js";
import { CollectionList } from "./admin/pages/collection-list.js";
import { DocumentEditor } from "./admin/pages/document-editor.js";
import { resolveJoinContext } from "./admin/join-context.js";
import type { BebopAdminProps } from "./admin/types.js";

export type {
  BebopAdminClient,
  BebopAdminProps,
  BebopAdminUser,
  BebopAuthAdminClient,
} from "./admin/types.js";

export function BebopAdmin({ app, client, manifest, canAccessAdmin, canManageUsers = false, authClient, user, createDefaults, preflightCreate, preflightUpdate, relationOptions, onLogout }: BebopAdminProps) {
  const [mutationError, setMutationError] = useState<string>();

  useEffect(() => {
    if (!canAccessAdmin) return;
    return client.onMutationError((event) => {
      setMutationError(event.code === "permission_denied"
        ? "Jazz rejected a write because the current session does not have access."
        : "Jazz could not sync a recent write. The local change may be reverted when sync finishes.");
    });
  }, [canAccessAdmin, client]);

  const route = useRoutes([
    {
      element: <AdminLayout manifest={manifest} canManageUsers={canManageUsers} user={user} onLogout={onLogout} mutationError={mutationError} />,
      children: [
        { index: true, element: <DashboardPage manifest={manifest} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug", element: <CollectionRoute app={app} client={client} manifest={manifest} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug/create", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} preflightCreate={preflightCreate} preflightUpdate={preflightUpdate} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug/:id", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} preflightCreate={preflightCreate} preflightUpdate={preflightUpdate} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);

  return canAccessAdmin ? route : <main className="bebop-admin grid min-h-svh place-items-center bg-background px-6 font-sans text-foreground"><p role="alert">You do not have access to the Bebop admin.</p></main>;
}

function CollectionRoute({ app, client, manifest, relationOptions, authClient, canManageUsers }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "relationOptions" | "authClient" | "canManageUsers">) {
  const { collectionSlug = "" } = useParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  if (collection.auth) return <AuthUsersList collection={collection} authClient={authClient} canManageUsers={Boolean(canManageUsers)} />;
  return <CollectionList key={collection.slug} app={app} client={client} collection={collection} manifest={manifest} relationOptions={relationOptions} />;
}

function EditorRoute({ app, client, manifest, createDefaults, preflightCreate, preflightUpdate, relationOptions, authClient, canManageUsers }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "createDefaults" | "preflightCreate" | "preflightUpdate" | "relationOptions" | "authClient" | "canManageUsers">) {
  const { collectionSlug = "", id } = useParams();
  const [searchParams] = useSearchParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  if (collection.auth) {
    return id
      ? <AuthUserEditor key={`${collection.slug}:${id}`} collection={collection} authClient={authClient} canManageUsers={Boolean(canManageUsers)} id={id} />
      : <AuthUserCreate collection={collection} authClient={authClient} canManageUsers={Boolean(canManageUsers)} />;
  }
  const joinContext = resolveJoinContext(manifest, collectionSlug, searchParams);
  return <DocumentEditor key={`${collectionSlug}:${id ?? "new"}:${searchParams.toString()}`} app={app} client={client} manifest={manifest} collection={collection} id={id} createDefaults={createDefaults?.[collectionSlug]} preflightCreate={preflightCreate} preflightUpdate={preflightUpdate} joinContext={joinContext} relationOptions={relationOptions} />;
}
