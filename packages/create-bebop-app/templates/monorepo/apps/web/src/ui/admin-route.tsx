import { useMemo } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useDb } from "jazz-tools/react";
import { BebopAdmin } from "@bebopdev/admin";
import { BrowserRouter, Route as RouterRoute, Routes } from "react-router-dom";
import { app } from "../../bebop-generated-schema.js";
import { bebopAdminManifest } from "../../bebop-admin-manifest.js";
import { createBebopClient } from "../../bebop-generated-client.js";
import { BebopProviderFallback } from "./provider-fallback.js";

export function AdminRoute() {
  return <ClientOnly fallback={<BebopProviderFallback />}><AdminWithJazzClient /></ClientOnly>;
}

function AdminWithJazzClient() {
  const db = useDb();
  const client = useMemo(() => createBebopClient(db), [db]);
  return (
    <BrowserRouter>
      <Routes>
        <RouterRoute path="/admin/*" element={<BebopAdmin app={app} client={client} manifest={bebopAdminManifest} canAccessAdmin />} />
      </Routes>
    </BrowserRouter>
  );
}
