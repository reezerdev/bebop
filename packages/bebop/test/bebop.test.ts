import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "jazz-tools";
import { collection, defineConfig, text } from "../src/bebop.ts";
import { BebopHookError, createBebopClient } from "../src/client.ts";
import { compilePermissions } from "../src/compiler.ts";

test("permission generation compiles configured Jazz rules and leaves omitted operations denied", () => {
  const config = defineConfig({
    collections: {
      posts: collection({
        fields: { ownerId: text(), published: { kind: "boolean" as const } },
        access: {
          read: ({ session }) => ({ ownerId: session.user.account }),
          create: () => ({}),
        },
      }),
    },
  });

  const permissions = compilePermissions(config, "./config.js");
  assert.match(permissions, /import bebopConfig from "\.\/config\.js"/);
  assert.match(permissions, /policy\.posts\.allowRead\.where/);
  assert.match(permissions, /policy\.posts\.allowInsert\.where/);
  assert.doesNotMatch(permissions, /allowUpdate|allowDelete|\.always\(\)/);
  assert.equal(permissions, compilePermissions(config, "./config.js"));
});

test("permissions with no configured rules do not create implicit grants", () => {
  const config = defineConfig({
    collections: {
      posts: collection({ fields: { title: text() } }),
    },
  });

  const permissions = compilePermissions(config);
  assert.doesNotMatch(permissions, /allow(Read|Insert|Update|Delete)|\.always\(\)/);
  assert.match(permissions, /Missing collection operations are denied/);
});

test("permission callbacks can build correlated exists rules against another collection", () => {
  const config = defineConfig({
    collections: {
      posts: collection({
        fields: { title: text() },
        access: {
          read: ({ row, exists }) => exists("members", { postId: row.id, role: "editor" }),
        },
      }),
      members: collection({
        fields: { postId: text(), role: text() },
      }),
    },
  });

  const permissions = compilePermissions(config, "./config.js");
  assert.match(permissions, /const exists = \(collectionName: string/);
  assert.match(permissions, /Unknown collection in access\.exists\(\): \$\{collectionName\}/);
  assert.match(permissions, /read!\(\{ row, session, allOf, anyOf, exists, isCreator \}\)/);
});

function createFakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const events: ((event: { code: string; reason: string; transaction: never }) => void)[] = [];
  let nextId = 1;
  const table = { where: (condition: Record<string, unknown>) => ({ table: "posts", condition }) };
  const db = {
    one: async (query: { condition: { id?: unknown } }) => rows.get(String(query.condition.id)) ?? null,
    insert: (_table: unknown, data: Record<string, unknown>) => {
      const value = { id: `post-${nextId++}`, ...data };
      rows.set(value.id, value);
      return { value, wait: async () => value, txId: Promise.resolve("tx") };
    },
    update: (_table: unknown, id: string, data: Record<string, unknown>) => {
      rows.set(id, { ...rows.get(id), ...data, id });
      return { value: undefined, wait: async () => undefined, txId: Promise.resolve("tx") };
    },
    delete: (_table: unknown, id: string) => {
      rows.delete(id);
      return { value: undefined, wait: async () => undefined, txId: Promise.resolve("tx") };
    },
    onMutationError: (listener: (event: { code: string; reason: string; transaction: never }) => void) => {
      events.push(listener);
      return () => events.splice(events.indexOf(listener), 1);
    },
  };
  return { app: { posts: table }, db: db as unknown as Db, rows, events };
}

test("shared mutations run before and after hooks around optimistic writes", async () => {
  const order: string[] = [];
  const config = defineConfig({
    collections: {
      posts: collection({
        fields: { title: text({ required: true }) },
        hooks: {
          beforeChange: ({ operation, data }) => {
            order.push(`before:${operation}`);
            return { title: `${data.title}!` };
          },
          afterChange: ({ operation }) => { order.push(`after:${operation}`); },
          beforeDelete: ({ id }) => { order.push(`before:delete:${id}`); },
          afterDelete: ({ id }) => { order.push(`after:delete:${id}`); },
        },
      }),
    },
  });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });

  if (false) {
    // @ts-expect-error The create API requires the configured required title field.
    void client.posts.create({});
  }

  const created = await client.posts.create({ title: "first" });
  assert.equal(created.doc.title, "first!");
  assert.equal(fake.rows.get(created.doc.id)?.title, "first!");

  await client.posts.update(created.doc.id, { title: "second" });
  await client.posts.delete(created.doc.id);
  assert.deepEqual(order, [
    "before:create",
    "after:create",
    "before:update",
    "after:update",
    `before:delete:${created.doc.id}`,
    `after:delete:${created.doc.id}`,
  ]);
  assert.equal(fake.rows.has(created.doc.id), false);
});

test("a before hook exception cancels the local write", async () => {
  const config = defineConfig({
    collections: {
      posts: collection({
        fields: { title: text({ required: true }) },
        hooks: {
          beforeChange: ({ data }) => {
            if (data.title === "blocked") throw new Error("blocked by hook");
          },
        },
      }),
    },
  });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });

  await assert.rejects(client.posts.create({ title: "blocked" }), /blocked by hook/);
  assert.equal(fake.rows.size, 0);
});

test("an after hook failure reports that the local write already happened", async () => {
  const config = defineConfig({
    collections: {
      posts: collection({
        fields: { title: text({ required: true }) },
        hooks: {
          afterChange: () => { throw new Error("after hook failed"); },
        },
      }),
    },
  });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });

  await assert.rejects(client.posts.create({ title: "already local" }), (error: unknown) => {
    assert.ok(error instanceof BebopHookError);
    assert.equal(error.localWriteApplied, true);
    return true;
  });
  assert.equal(fake.rows.size, 1);
});

test("shared client forwards asynchronous Jazz mutation rejections", () => {
  const config = defineConfig({
    collections: {
      posts: collection({ fields: { title: text() } }),
    },
  });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });
  let receivedCode: string | undefined;
  client.onMutationError((event) => { receivedCode = event.code; });
  fake.events[0]?.({ code: "permission_denied", reason: "denied", transaction: undefined as never });
  assert.equal(receivedCode, "permission_denied");
});
