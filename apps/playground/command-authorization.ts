export type WorkspaceCommandAuthorizationInput = {
  userId?: string;
  collection: string;
  operation: string;
  data?: Record<string, unknown>;
  originalDoc?: Record<string, unknown>;
  isGlobalAdmin: () => Promise<boolean>;
  isActiveWorkspaceAdmin: (workspaceId: string) => Promise<boolean>;
};

/** Authorize the server-only workspace and membership command surface. */
export async function authorizeWorkspaceCommand({
  userId,
  collection,
  operation,
  data,
  originalDoc,
  isGlobalAdmin,
  isActiveWorkspaceAdmin,
}: WorkspaceCommandAuthorizationInput): Promise<boolean> {
  if (!userId) return false;
  // Creation must always use the atomic endpoint that inserts the creator's
  // active membership in the same exclusive Jazz transaction.
  if (collection === "workspaces" && operation === "create") return false;
  if (await isGlobalAdmin()) return true;
  if (collection === "workspaceMemberships") return false;
  if (collection !== "workspaces" || operation !== "update" || !originalDoc || !data) return false;
  if (Object.keys(data).some((key) => key !== "name") || typeof data.name !== "string" || !data.name.trim()) return false;
  return isActiveWorkspaceAdmin(String(originalDoc.id));
}
