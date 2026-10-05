import type { createBebopClient } from "../bebop-generated-client.js";

type ChannelClient = ReturnType<typeof createBebopClient>["channels"];

/** Create the Workspace's standard Channels through Bebop's Channel lifecycle hooks. */
export async function createDefaultWorkspaceChannels(
  channels: Pick<ChannelClient, "create">,
  workspaceId: string,
  authorId: string,
) {
  const created: Awaited<ReturnType<ChannelClient["create"]>>["doc"][] = [];
  for (const name of ["general", "random"] as const) {
    const channel = await channels.create({
      name,
      workspaceId,
      authorId,
      content: "",
      visibility: "public",
    });
    await channel.waitForGlobal();
    created.push(channel.doc);
  }
  return created;
}
