import { createBebopClient as createClient } from "@bebopdev/core";
import type { BebopCommandTransport } from "@bebopdev/core";
import type { Db } from "jazz-tools";
import { app } from "../web/bebop-generated-schema";
import bebopConfig from "../web/bebop.config";

export function createBebopClient(
  db: Db,
  options: { commandTransport?: BebopCommandTransport } = {},
) {
  return createClient({ app, config: bebopConfig, db, ...options });
}
