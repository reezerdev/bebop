import { validateCollectionData, type CollectionDefinition, type Fields } from "@bebopdev/core";
import type { Db, WriteHandle } from "jazz-tools";
import type { createBebopClient } from "../bebop-generated-client.js";
import { app } from "../bebop-generated-schema.js";
import bebopConfig from "../bebop.config.js";

type Client = ReturnType<typeof createBebopClient>;
type ChannelCreate = Omit<Parameters<Client["channels"]["create"]>[0], "streamId" | "visibility" | "authorId"> & {
  streamId?: string;
  visibility?: "public" | "private";
  authorId?: string;
};
type ChannelCollection = Omit<Client["channels"], "create"> & {
  create(data: ChannelCreate): ReturnType<Client["channels"]["create"]>;
};
export type StreamClient = Omit<Client, "channels"> & { channels: ChannelCollection };

function collectionDefinition(slug: string): CollectionDefinition<Fields> {
  const definition = bebopConfig.collections.find((collection) => collection.slug === slug);
  if (!definition) throw new Error(`Missing Bebop collection definition for "${slug}".`);
  return definition as unknown as CollectionDefinition<Fields>;
}

function localMutation<TDocument>(
  doc: TDocument,
  write: WriteHandle<unknown, unknown>,
  dependencies: readonly WriteHandle<unknown, unknown>[] = [],
) {
  return {
    doc,
    durability: "local" as const,
    write,
    waitForGlobal: async () => {
      for (const dependency of dependencies) await dependency.wait({ tier: "global" });
      await write.wait({ tier: "global" });
    },
  };
}

/** Queue a Channel's Stream, initial admin membership, and Channel in dependency order. */
export function withStreamCollections(client: Client, db: Db, userId: string): StreamClient {
  const channels = client.channels;
  const channelMethods = {
    async create(data: ChannelCreate) {
      if (!userId) throw new Error("Sign in before creating a Channel.");
      const input = {
        ...data,
        authorId: userId,
        visibility: data.visibility ?? "public",
        streamId: crypto.randomUUID(),
      };
      await validateCollectionData(collectionDefinition("channels"), input, "create");

      const streamWrite = db.insert(app.streams, {
        name: `"${input.name}" Channel stream`,
        workspaceId: input.workspaceId,
        authorId: userId,
      }, { id: input.streamId });
      const membershipWrite = db.insert(app.streamMemberships, {
        workspaceId: input.workspaceId,
        streamId: streamWrite.value.id,
        userId,
        role: "admin",
      });
      const write = db.insert(app.channels, {
        ...input,
        streamId: streamWrite.value.id,
      });

      return localMutation(
        write.value as unknown as NonNullable<Awaited<ReturnType<Client["channels"]["findById"]>>>,
        write,
        [streamWrite, membershipWrite],
      ) as Awaited<ReturnType<Client["channels"]["create"]>>;
    },
    async delete(id: string) {
      const write = await db.transaction(async (tx) => {
        const channel = await tx.one(app.channels.where({ id }));
        if (!channel) return null;
        const entries = await tx.all(app.entries.where({ streamId: channel.streamId }));
        const memberships = await tx.all(app.streamMemberships.where({ streamId: channel.streamId }));
        for (const entry of entries) tx.delete(app.entries, entry.id);
        for (const membership of memberships) tx.delete(app.streamMemberships, membership.id);
        const stream = await tx.one(app.streams.where({ id: channel.streamId }));
        if (stream) tx.delete(app.streams, stream.id);
        tx.delete(app.channels, id);
        return channel;
      });
      if (!write.value) return channels.delete(id);
      return { id, ...localMutation(
        write.value as unknown as NonNullable<Awaited<ReturnType<Client["channels"]["findById"]>>>,
        write,
      ) } as Awaited<ReturnType<Client["channels"]["delete"]>>;
    },
  };
  const wrappedChannels = new Proxy(channels as ChannelCollection, {
    get(target, property) {
      if (Object.hasOwn(channelMethods, property)) return Reflect.get(channelMethods, property, channelMethods);
      const member = Reflect.get(target, property, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
    has(target, property) {
      return Object.hasOwn(channelMethods, property) || Reflect.has(target, property);
    },
  });
  const wrapped = {
    ...client,
    channels: wrappedChannels,
  };
  return wrapped as unknown as StreamClient;
}
