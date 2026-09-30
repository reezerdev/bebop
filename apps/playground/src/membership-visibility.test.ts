import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAccountManager, createDb, type Db } from "jazz-tools";
import { createJazzSession } from "jazz-tools/backend";
import { deploy, startLocalJazzServer, startTestJwtIssuer } from "jazz-tools/testing";
import { createBebopClient } from "../bebop-generated-client.js";
import { app } from "../bebop-generated-schema.js";
import permissions from "../permissions.js";
import { withStreamCollections } from "./stream-client.js";

test("streams enforce Task, Channel, Entry, and membership visibility", async () => {
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
    const peerId = crypto.randomUUID();
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
    await authority.insert(app.better_auth_user, {
      name: "Peer User",
      email: `${peerId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "user",
    }, { id: peerId }).wait({ tier: "global" });
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
    const memberMembership = await authority.insert(app.workspaceMemberships, {
      workspaceId,
      userId: memberId,
      role: "member",
      status: "active",
    }).wait({ tier: "global" });
    const sharedStreamId = crypto.randomUUID();
    await authority.insert(app.streams, {
      name: "Shared task stream",
      workspaceId,
      authorId: memberId,
    }, { id: sharedStreamId }).wait({ tier: "global" });
    await authority.insert(app.streamMemberships, {
      streamId: sharedStreamId,
      userId: memberId,
      role: "admin",
    }).wait({ tier: "global" });
    const sharedTask = await authority.insert(app.tasks, {
      name: "Shared task",
      workspaceId,
      authorId: memberId,
      streamId: sharedStreamId,
      visibility: "public",
    }).wait({ tier: "global" });
    const outsideWorkspaceStreamId = crypto.randomUUID();
    await authority.insert(app.streams, {
      name: "Private task stream",
      workspaceId: privateWorkspaceId,
      authorId: memberId,
    }, { id: outsideWorkspaceStreamId }).wait({ tier: "global" });
    await authority.insert(app.streamMemberships, {
      streamId: outsideWorkspaceStreamId,
      userId: memberId,
      role: "admin",
    }).wait({ tier: "global" });
    const privateTask = await authority.insert(app.tasks, {
      name: "Task outside the admin's workspaces",
      workspaceId: privateWorkspaceId,
      authorId: memberId,
      streamId: outsideWorkspaceStreamId,
      visibility: "private",
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
    const existingTaskEdit = await createBebopClient(member).tasks.update(sharedTask.id, { content: "Task remains editable" });
    await existingTaskEdit.waitForGlobal();

    const peerMembership = await authority.insert(app.workspaceMemberships, {
      workspaceId,
      userId: peerId,
      role: "member",
      status: "active",
    }).wait({ tier: "global" });
    const peer = await openViewer(peerId, { role: "member" });
    const workspaceAdmin = admin;
    const memberClient = withStreamCollections(createBebopClient(member), member, memberId);
    const peerClient = createBebopClient(peer);
    const alternateWorkspaceId = crypto.randomUUID();
    await authority.insert(app.workspaces, {
      name: "Alternate Workspace",
      slug: `alternate-${alternateWorkspaceId}`,
    }, { id: alternateWorkspaceId }).wait({ tier: "global" });
    await authority.insert(app.workspaceMemberships, {
      workspaceId: alternateWorkspaceId,
      userId: memberId,
      role: "member",
      status: "active",
    }).wait({ tier: "global" });

    const publicTaskWrite = await memberClient.tasks.create({
      name: "Public stream task",
      workspaceId,
      authorId: memberId,
    });
    assert.equal(publicTaskWrite.durability, "local");
    await publicTaskWrite.waitForGlobal();
    const privateTaskWrite = await memberClient.tasks.create({
      name: "Private stream task",
      workspaceId,
      authorId: memberId,
      visibility: "private",
    });
    await privateTaskWrite.waitForGlobal();
    const protectedTaskWrite = await memberClient.tasks.create({
      name: "Protected stream task",
      workspaceId,
      authorId: memberId,
      visibility: "protected",
    });
    await protectedTaskWrite.waitForGlobal();

    const publicTask = publicTaskWrite.doc;
    const privateStreamId = privateTaskWrite.doc.streamId;
    const protectedStreamId = protectedTaskWrite.doc.streamId;
    assert.ok(publicTask.streamId);
    assert.ok(privateStreamId);
    assert.ok(protectedStreamId);
    assert.equal(publicTask.visibility, "public");

    const publicChannelWrite = await memberClient.channels.create({
      name: "Public channel",
      workspaceId,
      authorId: memberId,
    });
    await publicChannelWrite.waitForGlobal();
    const publicChannelStreamId = publicChannelWrite.doc.streamId;
    assert.equal(publicChannelWrite.doc.visibility, "public");
    const privateChannelWrite = await memberClient.channels.create({
      name: "Private channel",
      workspaceId,
      authorId: memberId,
      visibility: "private",
    });
    await privateChannelWrite.waitForGlobal();
    const privateChannelStreamId = privateChannelWrite.doc.streamId;
    assert.ok(privateChannelStreamId);

    await assert.rejects(async () => {
      const write = await memberClient.tasks.update(publicTask.id, { workspaceId: alternateWorkspaceId });
      await write.waitForGlobal();
    });
    await assert.rejects(async () => {
      const write = await memberClient.channels.update(privateChannelWrite.doc.id, { workspaceId: alternateWorkspaceId });
      await write.waitForGlobal();
    });

    const createdTaskMemberships = await memberClient.streamMemberships.find({ where: { streamId: privateStreamId } });
    assert.deepEqual(createdTaskMemberships.map((membership) => [membership.userId, membership.role]), [[memberId, "admin"]]);
    const replacementStreamWrite = await memberClient.streams.create({
      name: "Replacement stream",
      workspaceId,
      authorId: memberId,
    });
    await replacementStreamWrite.waitForGlobal();
    const replacementAdminMembership = await memberClient.streamMemberships.create({
      streamId: replacementStreamWrite.doc.id,
      userId: memberId,
      role: "admin",
    });
    await replacementAdminMembership.waitForGlobal();
    await assert.rejects(async () => {
      const write = await memberClient.tasks.update(privateTaskWrite.doc.id, { streamId: replacementStreamWrite.doc.id });
      await write.waitForGlobal();
    });
    await assert.rejects(async () => {
      const write = await memberClient.channels.update(privateChannelWrite.doc.id, { streamId: replacementStreamWrite.doc.id });
      await write.waitForGlobal();
    });
    const replacementStreamDelete = await memberClient.streams.delete(replacementStreamWrite.doc.id);
    await replacementStreamDelete.waitForGlobal();
    const replacementMembershipDelete = await memberClient.streamMemberships.delete(replacementAdminMembership.doc.id);
    await replacementMembershipDelete.waitForGlobal();

    const peerTaskIds = new Set((await peer.all(app.tasks.select("id"), { tier: "remote" })).map((task) => task.id));
    assert.ok(peerTaskIds.has(publicTask.id));
    assert.equal(peerTaskIds.has(privateTaskWrite.doc.id), false);
    assert.equal(peerTaskIds.has(protectedTaskWrite.doc.id), false);
    const peerChannelIds = new Set((await peer.all(app.channels.select("id"), { tier: "remote" })).map((channel) => channel.id));
    assert.ok(peerChannelIds.has(publicChannelWrite.doc.id));
    assert.equal(peerChannelIds.has(privateChannelWrite.doc.id), false);
    const managerTaskIds = new Set((await workspaceAdmin.all(app.tasks.select("id"), { tier: "remote" })).map((task) => task.id));
    assert.ok(managerTaskIds.has(privateTaskWrite.doc.id));
    assert.ok(managerTaskIds.has(protectedTaskWrite.doc.id));
    const managerChannelIds = new Set((await workspaceAdmin.all(app.channels.select("id"), { tier: "remote" })).map((channel) => channel.id));
    assert.ok(managerChannelIds.has(privateChannelWrite.doc.id));
    const peerStreamIds = await peer.all(app.streams.select("id"), { tier: "remote" });
    assert.ok(peerStreamIds.some((stream) => stream.id === publicTask.streamId));
    assert.ok(peerStreamIds.some((stream) => stream.id === publicChannelStreamId));
    assert.equal(peerStreamIds.some((stream) => stream.id === privateStreamId), false);

    const publicEntryWrite = await memberClient.entries.create({
      streamId: publicTask.streamId!,
      type: "message",
      content: "Visible in the public task stream",
      authorId: memberId,
    });
    await publicEntryWrite.waitForGlobal();
    const peerEntryIdsBeforeJoin = new Set((await peer.all(app.entries.select("id"), { tier: "remote" })).map((entry) => entry.id));
    assert.ok(peerEntryIdsBeforeJoin.has(publicEntryWrite.doc.id));

    const privateEntryWrite = await memberClient.entries.create({
      streamId: privateStreamId,
      type: "message",
      content: "Visible to private stream members",
      authorId: memberId,
    });
    await privateEntryWrite.waitForGlobal();
    assert.equal(peerEntryIdsBeforeJoin.has(privateEntryWrite.doc.id), false);
    const privateChannelEntryWrite = await memberClient.entries.create({
      streamId: privateChannelStreamId,
      type: "message",
      content: "Visible to private channel members",
      authorId: memberId,
    });
    await privateChannelEntryWrite.waitForGlobal();
    const peerChannelEntryIdsBeforeJoin = new Set((await peer.all(app.entries.select("id"), { tier: "remote" })).map((entry) => entry.id));
    assert.equal(peerChannelEntryIdsBeforeJoin.has(privateChannelEntryWrite.doc.id), false);

    const privateTaskMembership = await memberClient.streamMemberships.create({
      streamId: privateStreamId,
      userId: peerId,
      role: "member",
    });
    await privateTaskMembership.waitForGlobal();
    const protectedTaskMembership = await memberClient.streamMemberships.create({
      streamId: protectedStreamId,
      userId: peerId,
      role: "member",
    });
    await protectedTaskMembership.waitForGlobal();
    const privateChannelMembership = await memberClient.streamMemberships.create({
      streamId: privateChannelStreamId,
      userId: peerId,
      role: "member",
    });
    await privateChannelMembership.waitForGlobal();

    const joinedPeerTaskIds = new Set((await peer.all(app.tasks.select("id"), { tier: "remote" })).map((task) => task.id));
    assert.ok(joinedPeerTaskIds.has(privateTaskWrite.doc.id));
    assert.ok(joinedPeerTaskIds.has(protectedTaskWrite.doc.id));
    const joinedPeerChannelIds = new Set((await peer.all(app.channels.select("id"), { tier: "remote" })).map((channel) => channel.id));
    assert.ok(joinedPeerChannelIds.has(privateChannelWrite.doc.id));
    const joinedPeerEntryIds = new Set((await peer.all(app.entries.select("id"), { tier: "remote" })).map((entry) => entry.id));
    assert.ok(joinedPeerEntryIds.has(privateEntryWrite.doc.id));
    assert.ok(joinedPeerEntryIds.has(privateChannelEntryWrite.doc.id));
    await assert.rejects(async () => {
      const write = await peerClient.tasks.update(protectedTaskWrite.doc.id, { content: "Peer edit" });
      await write.waitForGlobal();
    });
    const managerEdit = await createBebopClient(workspaceAdmin).tasks.update(protectedTaskWrite.doc.id, { content: "Manager edit" });
    await managerEdit.waitForGlobal();
    await assert.rejects(async () => {
      const write = await peerClient.streamMemberships.create({
        streamId: privateStreamId,
        userId: memberId,
        role: "admin",
      });
      await write.waitForGlobal();
    });
    await assert.rejects(async () => {
      const write = await peerClient.streamMemberships.update(privateTaskMembership.doc.id, { role: "admin" });
      await write.waitForGlobal();
    });
    const ownerMembershipEdit = await memberClient.streamMemberships.update(privateTaskMembership.doc.id, { role: "admin" });
    await ownerMembershipEdit.waitForGlobal();

    const channelDelete = await memberClient.channels.delete(privateChannelWrite.doc.id);
    await channelDelete.waitForGlobal();
    assert.equal(await memberClient.channels.findById(privateChannelWrite.doc.id), null);
    assert.equal(await memberClient.streams.findById(privateChannelStreamId), null);
    assert.equal(await memberClient.streamMemberships.findById(privateChannelMembership.doc.id), null);
    assert.equal(await memberClient.entries.findById(privateChannelEntryWrite.doc.id), null);

    const taskDelete = await memberClient.tasks.delete(privateTaskWrite.doc.id);
    await taskDelete.waitForGlobal();
    assert.equal(await memberClient.tasks.findById(privateTaskWrite.doc.id), null);
    assert.equal(await memberClient.streams.findById(privateStreamId), null);
    assert.equal(await memberClient.entries.findById(privateEntryWrite.doc.id), null);
    assert.equal(await memberClient.streamMemberships.findById(privateTaskMembership.doc.id), null);
    assert.equal(await peer.canRead(app.workspaceMemberships, peerMembership.id), "denied");
  } finally {
    await Promise.all(viewers.map((viewer) => viewer.shutdown()));
    await authoritySession?.close();
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
    await issuer.stop();
  }
});
