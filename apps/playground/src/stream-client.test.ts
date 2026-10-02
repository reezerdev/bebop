import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "jazz-tools";
import { createBebopClient } from "../bebop-generated-client.js";
import { withStreamCollections } from "./stream-client.js";

test("stream-aware client keeps Bebop methods and Jazz's direct Channel query API", () => {
  const db = {} as Db;
  const client = withStreamCollections(createBebopClient(db), db, "user-1");

  assert.equal(typeof client.channels.create, "function");
  assert.equal(typeof client.channels.delete, "function");
  assert.equal(typeof client.channels.query, "function");
  assert.equal(typeof client.channels.where, "function");

  const bebopQuery = client.channels.query({ where: { name: "general" } });
  const jazzQuery = client.channels.where({ name: "general" }).include({ stream: true });
  assert.equal(bebopQuery._table, "channels");
  assert.equal(jazzQuery._table, "channels");
});
