import { validateCollectionData, type CollectionDefinition, type Fields } from "@bebopdev/core";
import type { Db, WriteHandle } from "jazz-tools";
import type { createBebopClient } from "../bebop-generated-client.js";
import { app } from "../bebop-generated-schema.js";
import bebopConfig from "../bebop.config.js";

type Client = ReturnType<typeof createBebopClient>;
type TaskCreate = Omit<Parameters<Client["tasks"]["create"]>[0], "streamId" | "visibility" | "authorId"> & {
  streamId?: string;
  visibility?: "public" | "private" | "protected";
  authorId?: string;
};
type ChannelCreate = Omit<Parameters<Client["channels"]["create"]>[0], "streamId" | "visibility" | "authorId"> & {
  streamId?: string;
  visibility?: "public" | "private";
  authorId?: string;
};
type TaskCollection = Omit<Client["tasks"], "create"> & {
  create(data: TaskCreate): ReturnType<Client["tasks"]["create"]>;
};
type ChannelCollection = Omit<Client["channels"], "create"> & {
  create(data: ChannelCreate): ReturnType<Client["channels"]["create"]>;
};
export type StreamClient = Omit<Client, "tasks" | "channels"> & {
  tasks: TaskCollection;
  channels: ChannelCollection;
};

function currentUser(userId: string): string {
  if (!userId) throw new Error("Sign in before creating a Task or Channel.");
  return userId;
}

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

/** Queue the Stream, initial admin membership, and record in dependency order. */
export function withStreamCollections(client: Client, db: Db, userId: string): StreamClient {
  const tasks = client.tasks;
  const channels = client.channels;

  const wrapped = {
    ...client,
    tasks: {
      ...tasks,
      async create(data: TaskCreate) {
        const actorId = currentUser(userId);
        const input = {
          ...data,
          authorId: actorId,
          visibility: data.visibility ?? "public",
          streamId: crypto.randomUUID(),
        };
        await validateCollectionData(collectionDefinition("tasks"), input, "create");

        // The alpha.58 authority checks relationship inserts against rows already persisted globally.
        const streamWrite = db.insert(app.streams, {
          name: `"${input.name}" Task stream`,
          workspaceId: input.workspaceId,
          authorId: actorId,
        }, { id: input.streamId });
        const membershipWrite = db.insert(app.streamMemberships, {
          streamId: streamWrite.value.id,
          userId: actorId,
          role: "admin",
        });
        const write = db.insert(app.tasks, {
          ...input,
          streamId: streamWrite.value.id,
        });

        return localMutation(
          write.value as unknown as NonNullable<Awaited<ReturnType<Client["tasks"]["findById"]>>>,
          write,
          [streamWrite, membershipWrite],
        ) as Awaited<ReturnType<Client["tasks"]["create"]>>;
      },
      async delete(id: string) {
        const write = await db.transaction(async (tx) => {
          const task = await tx.one(app.tasks.where({ id }));
          if (!task) return null;
          const entries = await tx.all(app.entries.where({ streamId: task.streamId }));
          const memberships = await tx.all(app.streamMemberships.where({ streamId: task.streamId }));
          for (const entry of entries) tx.delete(app.entries, entry.id);
          for (const membership of memberships) tx.delete(app.streamMemberships, membership.id);
          const stream = await tx.one(app.streams.where({ id: task.streamId }));
          if (stream) tx.delete(app.streams, stream.id);
          tx.delete(app.tasks, id);
          return task;
        });
        if (!write.value) return tasks.delete(id);
        return { id, ...localMutation(
          write.value as unknown as NonNullable<Awaited<ReturnType<Client["tasks"]["findById"]>>>,
          write,
        ) } as Awaited<ReturnType<Client["tasks"]["delete"]>>;
      },
    },
    channels: {
      ...channels,
      async create(data: ChannelCreate) {
        const actorId = currentUser(userId);
        const input = {
          ...data,
          authorId: actorId,
          visibility: data.visibility ?? "public",
          streamId: crypto.randomUUID(),
        };
        await validateCollectionData(collectionDefinition("channels"), input, "create");

        const streamWrite = db.insert(app.streams, {
          name: `"${input.name}" Channel stream`,
          workspaceId: input.workspaceId,
          authorId: actorId,
        }, { id: input.streamId });
        const membershipWrite = db.insert(app.streamMemberships, {
          streamId: streamWrite.value.id,
          userId: actorId,
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
    },
  };
  return wrapped as unknown as StreamClient;
}
