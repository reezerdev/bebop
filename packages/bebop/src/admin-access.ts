import type { BebopAdminAccessUser, BebopConfig } from "./bebop.ts";

export type BebopAdminAccessSession = {
  user: BebopAdminAccessUser;
  /** Resolved by the host auth integration. With Better Auth, this includes configured adminUserIds. */
  isAdmin: boolean;
};

export type BebopAdminAccessHandlerOptions<TConfig extends BebopConfig> = {
  config: TConfig;
  /** Resolve the authenticated user and whether the host auth provider recognizes them as an admin. */
  resolveSession: (request: Request) => Promise<BebopAdminAccessSession | null>;
  onError?: (error: unknown, context: { request: Request }) => void;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Create a host-mounted endpoint that checks whether a user may enter the Bebop admin. */
export function createBebopAdminAccessHandler<const TConfig extends BebopConfig>(options: BebopAdminAccessHandlerOptions<TConfig>) {
  return async function handleBebopAdminAccess(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ message: "Method not allowed." }), {
        status: 405,
        headers: { "allow": "GET", "cache-control": "no-store", "content-type": "application/json" },
      });
    }
    const authCollection = options.config.collections.find((collection) => collection.auth);
    if (!authCollection) return json({ message: "Bebop admin access requires an auth collection." }, 404);

    let session: BebopAdminAccessSession | null;
    try {
      session = await options.resolveSession(request);
    } catch (error) {
      options.onError?.(error, { request });
      return json({ message: "Could not verify admin access." }, 500);
    }
    if (!session?.user) return json({ allowed: false }, 401);

    try {
      const access = authCollection.access && authCollection.access !== "public" && authCollection.access !== "authenticated"
        ? authCollection.access
        : undefined;
      const allowed = access?.admin
        ? await access.admin({
          req: Object.assign(request, { user: session.user, isAdmin: session.isAdmin }),
        })
        : session.isAdmin;
      return json({ allowed: Boolean(allowed) }, allowed ? 200 : 403);
    } catch (error) {
      options.onError?.(error, { request });
      return json({ message: "The admin access callback failed." }, 500);
    }
  };
}
