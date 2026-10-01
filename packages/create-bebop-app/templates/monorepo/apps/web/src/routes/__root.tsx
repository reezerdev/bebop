import { ClientOnly, HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { JazzProvider } from "jazz-tools/react";
import { BebopProviderFallback } from "../ui/provider-fallback.js";
import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bebop Starter" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <ClientOnly fallback={<BebopProviderFallback />}>
          <JazzProvider
            appId={import.meta.env.VITE_JAZZ_APP_ID}
            serverUrl={import.meta.env.VITE_JAZZ_SERVER_URL}
            autoAttachDevTools={false}
          >
            <Outlet />
          </JazzProvider>
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  );
}
