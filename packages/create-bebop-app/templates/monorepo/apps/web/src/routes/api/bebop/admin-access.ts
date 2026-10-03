import { createFileRoute } from "@tanstack/react-router";
import { getAuthServer } from "../../../../auth.server.js";

export const Route = createFileRoute("/api/bebop/admin-access")({
  server: {
    handlers: {
      GET: async ({ request }) => (await getAuthServer()).adminAccessHandler(request),
    },
  },
});
