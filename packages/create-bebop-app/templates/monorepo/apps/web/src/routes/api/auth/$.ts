import { createFileRoute } from "@tanstack/react-router";
import { getAuthServer } from "../../../../auth.server.js";

async function handleAuthRequest({ request }: { request: Request }) {
  const { auth } = await getAuthServer();
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handleAuthRequest,
      POST: handleAuthRequest,
    },
  },
});
