import assert from "node:assert/strict";
import test from "node:test";
import { composeCollectionTitle, humanize, recordTitle } from "../src/ui/admin/record-values.js";
import { makeCollection } from "./fixtures.js";

test("collection titles compose select labels and related record names in configured order", () => {
  const collection = makeCollection([
    { name: "workspace", label: "Workspace", kind: "relation", storageName: "workspaceId", relationTo: "workspaces", required: true },
    { name: "role", label: "Role", kind: "select", storageName: "role", options: ["admin", "member"], optionLabels: { admin: "Administrator" }, required: true },
  ], { useAsTitle: ["workspace", "role"] });
  const row = { id: "membership-1", workspaceId: "workspace-1", role: "admin" };

  assert.equal(recordTitle(collection, row, { workspaces: [{ id: "workspace-1", name: "Platform Team" }] }), "Platform Team · Administrator");
  assert.equal(recordTitle(collection, row), "workspace-1 · Administrator");
});

test("empty title values are skipped and an empty title resolves to undefined", () => {
  const collection = makeCollection([
    { name: "title", label: "Title", kind: "text", storageName: "title", required: true },
  ], { useAsTitle: "title" });

  assert.equal(composeCollectionTitle(collection, () => "  "), undefined);
  assert.equal(recordTitle(collection, { id: "record-1", title: "" }), undefined);
});

test("field names are humanized consistently", () => {
  assert.equal(humanize("createdAt"), "created At");
  assert.equal(humanize("workspace-membership"), "workspace membership");
});
