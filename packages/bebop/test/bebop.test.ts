import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "jazz-tools";
import { collection, defineConfig, text } from "../src/bebop.ts";
import { BebopHookError, createBebopClient } from "../src/client.ts";
import { compileAdminManifest, compileArtifacts, compileClientFactory, compilePermissions, compileSchema } from "../src/compiler.ts";

test("admin manifest includes the configured title and field positions", () => {
  const config = defineConfig({
    collections: {
      posts: collection({
        fields: {
          title: text({ required: true, admin: { position: "main" } }),
          summary: text({ admin: { position: "sidebar" } }),
        },
        admin: { useAsTitle: "title" },
      }),
    },
  });

  const manifest = compileAdminManifest(config);
  assert.equal(manifest, compileAdminManifest(config));
  assert.match(manifest, /"useAsTitle": "title"/);
  assert.match(manifest, /"position": "main"/);
  assert.match(manifest, /"position": "sidebar"/);
  assert.doesNotMatch(manifest, /"sidebarFields"/);
  assert.throws(() => compileAdminManifest(defineConfig({
    collections: { posts: collection({ fields: { title: text({ admin: { position: "invalid" as "sidebar" } }) } }) },
  })), /admin\.position must be "main" or "sidebar"/);
});

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

test("one normalized config produces deterministic compiler artifacts", () => {
  const config = defineConfig({
    collections: {
      posts: collection({ fields: { title: text({ required: true }) }, admin: { useAsTitle: "title" } }),
    },
  });
  const artifacts = compileArtifacts(config, "./config.js");
  assert.deepEqual(artifacts, compileArtifacts(config, "./config.js"));
  assert.equal(artifacts.schema, compileSchema(config));
  assert.equal(artifacts.adminManifest, compileAdminManifest(config));
  assert.equal(artifacts.permissions, compilePermissions(config, "./config.js"));
  assert.equal(artifacts.clientFactory, compileClientFactory("./config.js"));
});

function createFakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const events: ((event: { code: string; reason: string; transaction: never }) => void)[] = [];
  let nextId = 1;
  const table = {
    where: (condition: Record<string, unknown>) => ({ table: "posts", condition }),
    select: (...fields: string[]) => {
      const operations: unknown[][] = [["select", ...fields]];
      const query = {
        operations,
        where: (condition: Record<string, unknown>) => { operations.push(["where", condition]); return query; },
        orderBy: (field: string, direction?: string) => { operations.push(["orderBy", field, direction]); return query; },
        limit: (value: number) => { operations.push(["limit", value]); return query; },
        offset: (value: number) => { operations.push(["offset", value]); return query; },
      };
      return query;
    },
  };
  const db = {
    one: async (query: { condition: { id?: unknown } }) => rows.get(String(query.condition.id)) ?? null,
    all: async () => [...rows.values()],
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

test("shared collection queries validate fields and expose Jazz pagination", async () => {
  const config = defineConfig({ collections: { posts: collection({ fields: { title: text() } }) } });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });
  const query = client.posts.query({ where: { title: "hello" }, orderBy: { field: "title", direction: "desc" }, limit: 10, offset: 20, includeTimestamps: true });
  assert.deepEqual((query as unknown as { operations: unknown[][] }).operations, [
    ["select", "*", "$createdAt", "$updatedAt"],
    ["where", { title: "hello" }],
    ["orderBy", "title", "desc"],
    ["limit", 10],
    ["offset", 20],
  ]);
  assert.throws(() => client.posts.query({ where: { missing: "x" } as never }), /Unknown posts query field/);
  assert.throws(() => client.posts.query({ limit: -1 }), /non-negative safe integer/);
  assert.deepEqual((client.posts.queryIds({ where: { title: "hello" } }) as unknown as { operations: unknown[][] }).operations, [
    ["select", "id"], ["where", { title: "hello" }],
  ]);
  assert.deepEqual(await client.posts.find(), []);
  assert.equal(await client.posts.findById("missing"), null);
});

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
  assert.equal(created.durability, "local");
  await created.waitForGlobal();
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
    assert.equal(typeof error.write.wait, "function");
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
