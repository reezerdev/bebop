import assert from "node:assert/strict";
import test from "node:test";
import { signOutWithLocalFallback } from "./logout.ts";

test("a sync failure closes Jazz without wiping local data before sign-out", async () => {
  const calls: string[] = [];
  const leftWritesLocal = await signOutWithLocalFallback(async () => {
    calls.push("sign-out");
  }, {
    shutdown: async (options) => {
      assert.equal(options?.waitForSync, true);
      calls.push("sync");
      const error = new Error("Pending writes could not sync");
      error.name = "GracefulShutdownSyncError";
      throw error;
    },
    logout: async (options) => {
      assert.equal(options?.wipeData, undefined);
      calls.push("close-local-db");
    },
  });

  assert.equal(leftWritesLocal, true);
  assert.deepEqual(calls, ["sync", "close-local-db", "sign-out"]);
});

test("a successful sync signs out without invoking the local fallback", async () => {
  const calls: string[] = [];
  const leftWritesLocal = await signOutWithLocalFallback(async () => {
    calls.push("sign-out");
  }, {
    shutdown: async () => { calls.push("sync"); },
    logout: async () => { calls.push("close-local-db"); },
  });
  assert.equal(leftWritesLocal, false);
  assert.deepEqual(calls, ["sync", "sign-out"]);
});

test("other sign-out failures never close the local Jazz database", async () => {
  let closed = false;
  await assert.rejects(signOutWithLocalFallback(async () => {
    throw new Error("Provider sign-out failed");
  }, { shutdown: async () => {}, logout: async () => { closed = true; } }), /Provider sign-out failed/);
  assert.equal(closed, false);
});
