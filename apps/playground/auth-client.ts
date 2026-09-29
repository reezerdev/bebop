import { createBebopBetterAuthClient } from "@bebopdev/core/auth-client";
import type { auth as generatedAuth } from "./bebop-generated-auth.js";

export const authClient = createBebopBetterAuthClient<typeof generatedAuth.options>();
