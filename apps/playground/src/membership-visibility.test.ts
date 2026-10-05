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
import { createDefaultWorkspaceChannels } from "./workspace-channels.js";

test("streams enforce Channel, Entry, and membership visibility", async () => {
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
    const workspaceAdminId = crypto.randomUUID();
    const configuredAdminId = crypto.randomUUID();
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
    await authority.insert(app.better_auth_user, {
      name: "Workspace Admin User",
      email: `${workspaceAdminId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "user",
    }, { id: workspaceAdminId }).wait({ tier: "global" });
    await authority.insert(app.better_auth_user, {
      name: "Configured Admin User",
      email: `${configuredAdminId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "user",
    }, { id: configuredAdminId }).wait({ tier: "global" });
    await authority.insert(app.workspaces, {
      name: "Shared Workspace",
      slug: `shared-${workspaceId}`,
    }, { id: workspaceId }).wait({ tier: "global" });
    await authority.insert(app.workspaces, {
      name: "Private Workspace",
      slug: `private-${privateWorkspaceId}`,
    }, { id: privateWorkspaceId }).wait({ tier: "global" });
    const workspaceAdminWorkspaceId = crypto.randomUUID();
    await authority.insert(app.workspaces, {
      name: "Workspace Admin's Workspace",
      slug: `workspace-admin-${workspaceAdminWorkspaceId}`,
    }, { id: workspaceAdminWorkspaceId }).wait({ tier: "global" });
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
    const workspaceAdminMembership = await authority.insert(app.workspaceMemberships, {
      workspaceId: workspaceAdminWorkspaceId,
      userId: workspaceAdminId,
      role: "admin",
      status: "active",
    }).wait({ tier: "global" });
    async function openViewer(userId: string, claims: Record<string, unknown>) {
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
    const workspaceAdmin = await openViewer(workspaceAdminId, { role: "user" });
    const configuredAdmin = await openViewer(configuredAdminId, { role: "user", bebopAdmin: true });
    assert.equal(admin.getAuthState().authMode, "external");

    const adminRows = await admin.all(app.workspaceMemberships.select("id"), { tier: "remote" });
    const memberRows = await member.all(app.workspaceMemberships.select("id"), { tier: "remote" });
    assert.deepEqual(adminRows.map((row) => row.id).sort(), [adminMembership.id, memberMembership.id, workspaceAdminMembership.id].sort());
    assert.deepEqual(memberRows.map((row) => row.id).sort(), [adminMembership.id, memberMembership.id].sort());
    assert.equal(await admin.canRead(app.workspaceMemberships, adminMembership.id), "allowed");
    assert.equal(await member.canRead(app.workspaceMemberships, adminMembership.id), "allowed");
    assert.equal(await member.canRead(app.workspaceMemberships, memberMembership.id), "allowed");
    assert.equal((await admin.all(app.workspaces.select("id"), { tier: "remote" })).length, 3);
    assert.deepEqual((await member.all(app.workspaces.select("id"), { tier: "remote" })).map((row) => row.id), [workspaceId]);
    assert.deepEqual((await workspaceAdmin.all(app.workspaces.select("id"), { tier: "remote" })).map((row) => row.id), [workspaceAdminWorkspaceId]);
    assert.equal(await member.canUpdate(app.workspaces, workspaceId, { name: "Not allowed" }), "denied");
    assert.equal(await workspaceAdmin.canUpdate(app.workspaces, workspaceAdminWorkspaceId, { name: "Name allowed by server" }), "denied");
    assert.equal(await admin.canUpdate(app.workspaces, privateWorkspaceId, { name: "Global admin direct writes stay blocked" }), "denied");
    assert.equal(await member.canInsert(app.workspaceMemberships, { workspaceId, userId: peerId, role: "member", status: "active" }), "denied");
    assert.equal(await admin.canInsert(app.workspaceMemberships, { workspaceId, userId: peerId, role: "member", status: "active" }), "denied");
    assert.deepEqual((await configuredAdmin.all(app.workspaces.select("id"), { tier: "remote" })).map((row) => row.id).sort(), [workspaceAdminWorkspaceId, privateWorkspaceId, workspaceId].sort());

    const peerMembership = await authority.insert(app.workspaceMemberships, {
      workspaceId,
      userId: peerId,
      role: "member",
      status: "active",
    }).wait({ tier: "global" });
    const peer = await openViewer(peerId, { role: "member" });
    const globalAdmin = admin;
    const memberClient = createBebopClient(member);
    const peerClient = createBebopClient(peer);
    const mediaData = { filename: "owner.png", mimeType: "image/png", filesize: 1, data: new Uint8Array([137]) };
    assert.equal(await member.canInsert(app.media, mediaData), "allowed");
    assert.equal(await configuredAdmin.canInsert(app.media, mediaData), "allowed");
    const mediaWrite = await member.insert(app.media, mediaData).wait({ tier: "global" });
    assert.equal((await peer.all(app.media.select("id"), { tier: "remote" })).some(({ id }) => id === mediaWrite.id), true);
    assert.equal(await member.canUpdate(app.media, mediaWrite.id, { alt: "Updated by creator" }), "allowed");
    assert.equal(await peer.canUpdate(app.media, mediaWrite.id, { alt: "Updated by another user" }), "denied");
    assert.equal(await peer.canDelete(app.media, mediaWrite.id), "denied");
    assert.equal(await configuredAdmin.canUpdate(app.media, mediaWrite.id, { alt: "Updated by configured admin" }), "allowed");
    assert.equal(await configuredAdmin.canDelete(app.media, mediaWrite.id), "allowed");
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

    const defaultChannels = await createDefaultWorkspaceChannels(memberClient.channels, workspaceId, memberId);
    assert.deepEqual(defaultChannels.map((channel) => channel.name), ["general", "random"]);
    for (const channel of defaultChannels) {
      const admins = await memberClient.streamMemberships.find({
        where: { streamId: channel.streamId, userId: memberId, role: "admin" },
      });
      assert.equal(admins.length, 1);
    }

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
      const write = await memberClient.channels.update(privateChannelWrite.doc.id, { workspaceId: alternateWorkspaceId });
      await write.waitForGlobal();
    });

    const replacementStreamWrite = await memberClient.streams.create({
      name: "Replacement stream",
      workspaceId,
      authorId: memberId,
    });
    await replacementStreamWrite.waitForGlobal();
    const replacementAdminMembership = await memberClient.streamMemberships.create({
      workspaceId,
      streamId: replacementStreamWrite.doc.id,
      userId: memberId,
      role: "admin",
    });
    await replacementAdminMembership.waitForGlobal();
    await assert.rejects(async () => {
      const write = await memberClient.channels.update(privateChannelWrite.doc.id, { streamId: replacementStreamWrite.doc.id });
      await write.waitForGlobal();
    });
    const replacementStreamDelete = await memberClient.streams.delete(replacementStreamWrite.doc.id);
    await replacementStreamDelete.waitForGlobal();
    const replacementMembershipDelete = await memberClient.streamMemberships.delete(replacementAdminMembership.doc.id);
    await replacementMembershipDelete.waitForGlobal();

    const peerChannelIds = new Set((await peer.all(app.channels.select("id"), { tier: "remote" })).map((channel) => channel.id));
    assert.ok(peerChannelIds.has(publicChannelWrite.doc.id));
    assert.equal(peerChannelIds.has(privateChannelWrite.doc.id), false);
    const managerChannelIds = new Set((await globalAdmin.all(app.channels.select("id"), { tier: "remote" })).map((channel) => channel.id));
    assert.ok(managerChannelIds.has(privateChannelWrite.doc.id));
    const peerStreamIds = await peer.all(app.streams.select("id"), { tier: "remote" });
    assert.ok(peerStreamIds.some((stream) => stream.id === publicChannelStreamId));
    assert.equal(peerStreamIds.some((stream) => stream.id === privateChannelStreamId), false);

    const publicEntryWrite = await memberClient.entries.create({
      streamId: publicChannelStreamId,
      type: "message",
      content: "Visible in the public channel stream",
      authorId: memberId,
    });
    await publicEntryWrite.waitForGlobal();
    const publicChannelMembership = await peerClient.streamMemberships.create({
      workspaceId,
      streamId: publicChannelStreamId,
      userId: peerId,
      role: "member",
    });
    await publicChannelMembership.waitForGlobal();
    const peerEntryIdsAfterPublicJoin = new Set((await peer.all(app.entries.select("id"), { tier: "remote" })).map((entry) => entry.id));
    assert.ok(peerEntryIdsAfterPublicJoin.has(publicEntryWrite.doc.id));

    const privateChannelEntryWrite = await memberClient.entries.create({
      streamId: privateChannelStreamId,
      type: "message",
      content: "Visible to private channel members",
      authorId: memberId,
    });
    await privateChannelEntryWrite.waitForGlobal();
    await authority.insert(app.workspaceMemberships, {
      workspaceId,
      userId: workspaceAdminId,
      role: "manager",
      status: "active",
    }).wait({ tier: "global" });
    const workspaceManagerJoin = await createBebopClient(workspaceAdmin).streamMemberships.create({
      workspaceId,
      streamId: privateChannelStreamId,
      userId: workspaceAdminId,
      role: "member",
    });
    await workspaceManagerJoin.waitForGlobal();
    await assert.rejects(async () => {
      const write = await peerClient.streamMemberships.create({
        workspaceId,
        streamId: privateChannelStreamId,
        userId: peerId,
        role: "member",
      });
      await write.waitForGlobal();
    });
    const privateChannelMembership = await memberClient.streamMemberships.create({
      workspaceId,
      streamId: privateChannelStreamId,
      userId: peerId,
      role: "member",
    });
    await privateChannelMembership.waitForGlobal();

    const joinedPeerChannelIds = new Set((await peer.all(app.channels.select("id"), { tier: "remote" })).map((channel) => channel.id));
    assert.ok(joinedPeerChannelIds.has(privateChannelWrite.doc.id));
    const joinedPeerEntryIds = new Set((await peer.all(app.entries.select("id"), { tier: "remote" })).map((entry) => entry.id));
    assert.ok(joinedPeerEntryIds.has(privateChannelEntryWrite.doc.id));
    await assert.rejects(async () => {
      const write = await peerClient.streamMemberships.create({
        workspaceId,
        streamId: privateChannelStreamId,
        userId: memberId,
        role: "admin",
      });
      await write.waitForGlobal();
    });
    await assert.rejects(async () => {
      const write = await peerClient.streamMemberships.update(privateChannelMembership.doc.id, { role: "admin" });
      await write.waitForGlobal();
    });
    const ownerMembershipEdit = await memberClient.streamMemberships.update(privateChannelMembership.doc.id, { role: "admin" });
    await ownerMembershipEdit.waitForGlobal();

    const privateStreamMemberships = await memberClient.streamMemberships.find({ where: { streamId: privateChannelStreamId } });
    const channelDelete = await memberClient.channels.delete(privateChannelWrite.doc.id);
    await channelDelete.waitForGlobal();
    assert.equal(await memberClient.channels.findById(privateChannelWrite.doc.id), null);
    assert.equal(await memberClient.streams.findById(privateChannelStreamId), null);
    for (const membership of privateStreamMemberships) {
      assert.equal(await memberClient.streamMemberships.findById(membership.id), null);
    }
    assert.equal(await memberClient.entries.findById(privateChannelEntryWrite.doc.id), null);

    assert.equal(await peer.canRead(app.workspaceMemberships, peerMembership.id), "allowed");
  } finally {
    await Promise.all(viewers.map((viewer) => viewer.shutdown()));
    await authoritySession?.close();
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
    await issuer.stop();
  }
});
