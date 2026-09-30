import assert from "node:assert/strict";
import test from "node:test";
import { resolveJoinContext } from "../src/ui/admin/join-context.js";
import { makeCollection } from "./fixtures.js";

const manifest = {
  collections: {
    workspaces: makeCollection([
      { name: "tasks", label: "Tasks", kind: "join", required: false, collection: "tasks", on: "workspace" },
    ]),
    tasks: makeCollection([
      { name: "workspace", label: "Workspace", kind: "relation", storageName: "workspaceId", relationTo: "workspaces", required: true },
    ]),
  },
};

test("valid join navigation resolves its relationship and encoded return path", () => {
  const params = new URLSearchParams({ bebopJoin: "workspaces.tasks", bebopParent: "workspace/one" });
  const context = resolveJoinContext(manifest, "tasks", params);

  assert.equal(context?.sourceSlug, "workspaces");
  assert.equal(context?.parentId, "workspace/one");
  assert.equal(context?.relationship.name, "workspace");
  assert.equal(context?.returnTo, "/admin/collections/workspaces/workspace%2Fone");
});

test("invalid join links are ignored when the join or relationship does not match", () => {
  assert.equal(resolveJoinContext(manifest, "tasks", new URLSearchParams({ bebopParent: "p1" })), undefined);
  assert.equal(resolveJoinContext(manifest, "workspaces", new URLSearchParams({ bebopJoin: "workspaces.tasks", bebopParent: "p1" })), undefined);
  assert.equal(resolveJoinContext(manifest, "tasks", new URLSearchParams({ bebopJoin: "workspaces.tasks.extra", bebopParent: "p1" })), undefined);
});
