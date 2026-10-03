import { createFileRoute } from "@tanstack/react-router";
import { getAuthServer } from "../../../../auth.server.js";

export const Route = createFileRoute("/api/bebop/admin-setup")({
  server: {
    handlers: {
      GET: async () => (await getAuthServer()).adminSetupStatus(),
    },
  },
});
