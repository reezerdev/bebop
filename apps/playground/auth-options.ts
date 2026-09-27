import { jwt } from "better-auth/plugins";
import { getBetterAuthURL } from "./auth-config.ts";

const baseURL = getBetterAuthURL(process.env.BETTER_AUTH_URL);

export const authOptions = {
  baseURL,
  // bebop generate only needs Better Auth's schema. auth.ts requires a real
  // secret before the runtime server can start.
  secret: process.env.BETTER_AUTH_SECRET ?? "bebop-schema-generation-placeholder-secret",
  emailAndPassword: { enabled: true },
  plugins: [
    jwt({
      jwks: { keyPairConfig: { alg: "ES256" } },
      jwt: { issuer: baseURL, audience: baseURL },
    }),
  ],
};
