import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAccountManager, createDb, type Db } from "jazz-tools";
import { createJazzSession } from "jazz-tools/backend";
import { deploy, startLocalJazzServer, startTestJwtIssuer } from "jazz-tools/testing";
import { app } from "../bebop-generated-schema.js";
import permissions from "../permissions.js";

test("admin JWT role grants cross-workspace reads while regular members remain scoped", async () => {
  const issuer = await startTestJwtIssuer();
  const dataDir = await mkdtemp(join(tmpdir(), "bebop-membership-claims-"));
  const server = await startLocalJazzServer({ dataDir, jwksUrl: issuer.jwksUrl, jwtIssuer: issuer.issuer, jwtAudience: issuer.audience });
  let authoritySession: Awaited<ReturnType<typeof createJazzSession>> | undefined;
  const viewers: Db[] = [];
  try {
    await deploy({ appId: server.appId, serverUrl: server.url, adminSecret: server.adminSecret, schema: app, permissions });
    authoritySession = await createJazzSession({ appId: server.appId, serverUrl: server.url, app, permissions, driver: { type: "memory" }, initial: { backendSecret: server.backendSecret } });
    const authority = authoritySession.getSnapshot().client?.db;
    assert.ok(authority);
    const workspaceId = crypto.randomUUID();
    const privateWorkspaceId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const now = new Date();
    await authority.insert(app.better_auth_user, {
      name: "Admin User",
      email: `${adminId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "admin",
    }, { id: adminId }).wait({ tier: "global" });
    await authority.insert(app.better_auth_user, {
      name: "Member User",
      email: `${memberId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "user",
    }, { id: memberId }).wait({ tier: "global" });
    await authority.insert(app.workspaces, {
      name: "Shared Workspace",
      slug: `shared-${workspaceId}`,
    }, { id: workspaceId }).wait({ tier: "global" });
    await authority.insert(app.workspaces, {
      name: "Private Workspace",
      slug: `private-${privateWorkspaceId}`,
    }, { id: privateWorkspaceId }).wait({ tier: "global" });
    const adminMembership = await authority.insert(app.workspaceMemberships, {
      workspaceId,
      userId: adminId,
      role: "admin",
      status: "active",
    }).wait({ tier: "global" });
    const sharedTask = await authority.insert(app.tasks, {
      name: "Shared task",
      workspaceId,
      authorId: memberId,
    }).wait({ tier: "global" });
    const privateTask = await authority.insert(app.tasks, {
      name: "Task outside the admin's workspaces",
      workspaceId: privateWorkspaceId,
      authorId: memberId,
    }).wait({ tier: "global" });
    const memberMembership = await authority.insert(app.workspaceMemberships, {
      workspaceId,
      userId: memberId,
      role: "member",
      status: "active",
    }).wait({ tier: "global" });

    async function openViewer(userId: string, claims: Record<string, string>) {
      let storedAccount: string | null = null;
      const accounts = await createAccountManager({
        appId: server.appId,
        serverUrl: server.url,
        store: {
          read: async () => storedAccount,
          update: async (transform) => { storedAccount = transform(storedAccount); },
        },
      });
      const account = await accounts.registerJWT(issuer.jwtForUser(userId, claims));
      const db = await createDb({ appId: server.appId, serverUrl: server.url, account, driver: { type: "memory" } });
      viewers.push(db);
      return db;
    }

    const admin = await openViewer(adminId, { role: "admin" });
    const member = await openViewer(memberId, { role: "member" });
    assert.equal(admin.getAuthState().authMode, "external");

    const adminRows = await admin.all(app.workspaceMemberships.select("id"), { tier: "remote" });
    const memberRows = await member.all(app.workspaceMemberships.select("id"), { tier: "remote" });
    assert.deepEqual(adminRows.map((row) => row.id).sort(), [adminMembership.id, memberMembership.id].sort());
    assert.deepEqual(memberRows.map((row) => row.id), []);
    assert.equal(await admin.canRead(app.workspaceMemberships, adminMembership.id), "allowed");
    assert.equal(await member.canRead(app.workspaceMemberships, adminMembership.id), "denied");

    const adminTasks = await admin.all(app.tasks.select("id"), { tier: "remote" });
    const memberTasks = await member.all(app.tasks.select("id"), { tier: "remote" });
    assert.deepEqual(adminTasks.map((row) => row.id).sort(), [sharedTask.id, privateTask.id].sort());
    assert.deepEqual(memberTasks.map((row) => row.id), [sharedTask.id]);
    assert.equal(await admin.canRead(app.tasks, privateTask.id), "allowed");
    assert.equal(await member.canRead(app.tasks, privateTask.id), "denied");
  } finally {
    await Promise.all(viewers.map((viewer) => viewer.shutdown()));
    await authoritySession?.close();
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
    await issuer.stop();
  }
});
