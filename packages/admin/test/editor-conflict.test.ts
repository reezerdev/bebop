import assert from "node:assert/strict";
import test from "node:test";
import { remoteChangeAction } from "../src/ui/admin/editor-conflict.js";

test("a remote update preserves a dirty draft and flags a conflict", () => {
  assert.equal(remoteChangeAction({ baseline: "v1", latest: "v2", dirty: true, conflict: false }), "preserve-draft");
});

test("a clean editor can reload newer data, while an existing conflict remains paused", () => {
  assert.equal(remoteChangeAction({ baseline: "v1", latest: "v2", dirty: false, conflict: false }), "reload-clean-form");
  assert.equal(remoteChangeAction({ baseline: "v1", latest: "v3", dirty: false, conflict: true }), "unchanged");
});
