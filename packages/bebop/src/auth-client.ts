import { createAuthClient, type ReactAuthClient } from "better-auth/react";
import type { BetterAuthOptions } from "better-auth";
import { adminClient, jwtClient } from "better-auth/client/plugins";

type BebopAuthClientOptions<Options extends BetterAuthOptions> = {
  plugins: [ReturnType<typeof jwtClient>, ReturnType<typeof adminClient>];
  $InferAuth: Options;
};

export type BebopAuthAdminClient = {
  admin: {
    listUsers: (input: { query: {
      limit: number;
      offset: number;
      sortBy?: string;
      sortDirection?: "asc" | "desc";
      searchValue?: string;
      searchField?: "name" | "email";
      searchOperator?: "contains";
    } }) => Promise<{
      data?: { users: readonly (Record<string, unknown> & { id: string })[]; total: number } | null;
      error?: { message?: string } | null;
    }>;
  };
};

/** Create a Better Auth browser client with Bebop's JWT and Admin plugins enabled. */
export function createBebopBetterAuthClient<Options extends BetterAuthOptions = BetterAuthOptions>(): ReactAuthClient<BebopAuthClientOptions<Options>> & BebopAuthAdminClient {
  const plugins: [ReturnType<typeof jwtClient>, ReturnType<typeof adminClient>] = [jwtClient(), adminClient()];
  // Better Auth's adminClient() exposes route methods through its proxy at runtime;
  // its generic client declaration does not currently infer those methods from $InferAuth.
  return createAuthClient({ plugins, $InferAuth: undefined as unknown as Options }) as ReactAuthClient<BebopAuthClientOptions<Options>> & BebopAuthAdminClient;
}
