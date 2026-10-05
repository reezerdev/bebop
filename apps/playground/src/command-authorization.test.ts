import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeWorkspaceCommand } from "../command-authorization.js";

const workspaceId = "workspace-1";

test("workspace create cannot bypass the atomic membership transaction", async () => {
  assert.equal(await authorizeWorkspaceCommand({
    userId: "admin",
    collection: "workspaces",
    operation: "create",
    isGlobalAdmin: async () => true,
    isActiveWorkspaceAdmin: async () => true,
  }), false);
});

test("ordinary users cannot issue standalone membership commands", async () => {
  for (const operation of ["create", "update", "delete"]) {
    assert.equal(await authorizeWorkspaceCommand({
      userId: "member",
      collection: "workspaceMemberships",
      operation,
      data: { role: "admin" },
      originalDoc: { id: "membership-1" },
      isGlobalAdmin: async () => false,
      isActiveWorkspaceAdmin: async () => true,
    }), false);
  }
});

test("workspace admins can rename only their own active workspace", async () => {
  const check = (workspaceAdmin: boolean, data: Record<string, unknown>) => authorizeWorkspaceCommand({
    userId: "member",
    collection: "workspaces",
    operation: "update",
    data,
    originalDoc: { id: workspaceId },
    isGlobalAdmin: async () => false,
    isActiveWorkspaceAdmin: async (id) => id === workspaceId && workspaceAdmin,
  });

  assert.equal(await check(true, { name: "New name" }), true);
  assert.equal(await check(false, { name: "New name" }), false);
  assert.equal(await check(true, { name: "New name", slug: "forged" }), false);
  assert.equal(await check(true, { name: "  " }), false);
});

test("global admins can run collection commands while unauthenticated users cannot", async () => {
  const admin = (collection: string, operation: string) => authorizeWorkspaceCommand({
    userId: "admin",
    collection,
    operation,
    isGlobalAdmin: async () => true,
    isActiveWorkspaceAdmin: async () => false,
  });

  assert.equal(await admin("workspaceMemberships", "create"), true);
  assert.equal(await admin("workspaceMemberships", "update"), true);
  assert.equal(await admin("workspaceMemberships", "delete"), true);
  assert.equal(await authorizeWorkspaceCommand({
    collection: "workspaceMemberships",
    operation: "create",
    isGlobalAdmin: async () => true,
    isActiveWorkspaceAdmin: async () => false,
  }), false);
});
