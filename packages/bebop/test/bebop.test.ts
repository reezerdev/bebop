import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "jazz-tools";
import { defineConfig } from "../src/bebop.ts";
import { BebopHookError, createBebopClient } from "../src/client.ts";
import { compileAdminManifest, compileArtifacts, compileClientFactory, compilePermissions, compileSchema, normalizeConfig } from "../src/compiler.ts";

test("admin manifest includes the configured title and field positions", () => {
  const config = defineConfig({
    collections: [{
      slug: "posts",
      labels: { singular: "Blog Post", plural: "Blog Posts" },
      fields: [
        { name: "title", type: "text", required: true, admin: { position: "main" } },
        { name: "summary", type: "text", admin: { position: "sidebar" } },
      ],
      admin: { useAsTitle: "title" },
    }],
  });

  const manifest = compileAdminManifest(config);
  assert.equal(manifest, compileAdminManifest(config));
  assert.match(manifest, /"useAsTitle": "title"/);
  assert.match(manifest, /"singular": "Blog Post"/);
  assert.match(manifest, /"plural": "Blog Posts"/);
  assert.match(manifest, /"position": "main"/);
  assert.match(manifest, /"position": "sidebar"/);
  assert.doesNotMatch(manifest, /"sidebarFields"/);
  assert.throws(() => compileAdminManifest(defineConfig({
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text", admin: { position: "invalid" as "sidebar" } }] }],
  })), /admin\.position must be "main" or "sidebar"/);
});

test("collection labels default from the slug and reject empty overrides", () => {
  const config = defineConfig({
    collections: [
      { slug: "posts", fields: [{ name: "title", type: "text" }] },
      { slug: "categories", fields: [{ name: "title", type: "text" }] },
      { slug: "stories", admin: { label: "Case Studies" }, fields: [{ name: "title", type: "text" }] },
    ],
  });
  assert.deepEqual(normalizeConfig(config).collections.map((item) => item.admin.labels), [
    { singular: "Post", plural: "Posts" },
    { singular: "Category", plural: "Categories" },
    { singular: "Case Study", plural: "Case Studies" },
  ]);
  assert.throws(() => compileAdminManifest(defineConfig({
    collections: [{ slug: "posts", labels: { singular: " " }, fields: [{ name: "title", type: "text" }] }],
  })), /labels\.singular cannot be empty/);
});

test("permission generation compiles configured Jazz rules and leaves omitted operations denied", () => {
  const config = defineConfig({
    collections: [{
      slug: "posts",
      fields: [{ name: "ownerId", type: "text" }, { name: "published", type: "checkbox" }],
      access: {
        read: ({ session }) => ({ ownerId: session.user.account }),
        create: () => ({}),
      },
    }],
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
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text" }] }],
  });

  const permissions = compilePermissions(config);
  assert.doesNotMatch(permissions, /allow(Read|Insert|Update|Delete)|\.always\(\)/);
  assert.match(permissions, /Missing collection operations are denied/);
});

test("public access grants all operations without empty callbacks", () => {
  const config = defineConfig({
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text" }], access: "public" }],
  });

  const permissions = compilePermissions(config);
  for (const operation of ["Read", "Insert", "Update", "Delete"]) {
    assert.match(permissions, new RegExp(`policy\\.posts\\.allow${operation}\\.always\\(\\)`));
  }
  assert.doesNotMatch(permissions, /import bebopConfig/);
  assert.doesNotMatch(permissions, /\.where\(\(row\)/);
  assert.equal(permissions, compilePermissions(config));
});

test("permission callbacks can build correlated exists rules against another collection", () => {
  const config = defineConfig({
    collections: [{
      slug: "posts",
      fields: [{ name: "title", type: "text" }],
      access: {
        read: ({ row, exists }) => exists("members", { postId: row.id, role: "editor" }),
      },
    }, {
      slug: "members",
      fields: [{ name: "postId", type: "text" }, { name: "role", type: "text" }],
    }],
  });

  const permissions = compilePermissions(config, "./config.js");
  assert.match(permissions, /const exists = \(collectionName: string/);
  assert.match(permissions, /Unknown collection in access\.exists\(\): \$\{collectionName\}/);
  assert.match(permissions, /read!\(\{ row, session, allOf, anyOf, exists, isCreator \}\)/);
});

test("one normalized config produces deterministic compiler artifacts", () => {
  const config = defineConfig({
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text", required: true }], admin: { useAsTitle: "title" } }],
  });
  const artifacts = compileArtifacts(config, "./config.js");
  assert.deepEqual(artifacts, compileArtifacts(config, "./config.js"));
  assert.equal(artifacts.schema, compileSchema(config));
  assert.equal(artifacts.adminManifest, compileAdminManifest(config));
  assert.equal(artifacts.permissions, compilePermissions(config, "./config.js"));
  assert.equal(artifacts.clientFactory, compileClientFactory("./config.js"));
});

test("Payload-style field objects keep the supported Jazz storage types", () => {
  const config = defineConfig({
    collections: [
      { slug: "users", fields: [{ name: "name", type: "text", required: true }] },
      {
        slug: "posts",
        fields: [
          { name: "title", label: "Post title", type: "text", required: true },
          { name: "rating", type: "number" },
          { name: "views", type: "number", integer: true },
          { name: "published", type: "checkbox" },
          { name: "publishedAt", type: "date" },
          { name: "metadata", type: "json" },
          { name: "status", type: "select", options: [{ label: "Draft", value: "draft" }, "published"] },
          { name: "author", type: "relationship", relationTo: "users", required: true },
        ],
      },
    ],
  });

  const schema = compileSchema(config);
  const manifest = compileAdminManifest(config);
  assert.match(schema, /"rating": s\.float\(\)\.optional\(\)/);
  assert.match(schema, /"views": s\.int\(\)\.optional\(\)/);
  assert.match(schema, /"published": s\.boolean\(\)\.optional\(\)/);
  assert.match(schema, /"publishedAt": s\.timestamp\(\)\.optional\(\)/);
  assert.match(schema, /"metadata": s\.json\(\)\.optional\(\)/);
  assert.match(schema, /"status": s\.enum\("draft", "published"\)\.optional\(\)/);
  assert.match(schema, /"authorId": s\.uuid\(\)/);
  assert.match(schema, /"author": s\.rel\("users", "authorId"\)/);
  assert.match(manifest, /"label": "Post title"/);
  assert.match(manifest, /"options": \[\s*"draft",\s*"published"\s*\]/);
  assert.match(manifest, /"optionLabels": \{\s*"draft": "Draft"\s*\}/);
});

test("field arrays reject duplicate names and invalid admin references", () => {
  assert.throws(() => compileSchema(defineConfig({ collections: [{
    slug: "posts",
    fields: [{ name: "title", type: "text" }, { name: "title", type: "text" }],
  }] })), /Duplicate field name "title"/);
  assert.throws(() => compileSchema(defineConfig({ collections: [{
    slug: "posts",
    fields: [{ name: "author", type: "relationship", relationTo: "posts" }, { name: "authorId", type: "text" }],
  }] })), /conflicts with another stored field/);
  assert.throws(() => compileAdminManifest(defineConfig({ collections: [{
    slug: "posts",
    fields: [{ name: "title", type: "text" }],
    admin: { defaultColumns: ["missing"] },
  }] })), /admin\.defaultColumns references unknown field "missing"/);
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
  const config = defineConfig({ collections: [{ slug: "posts", fields: [{ name: "title", type: "text" }] }] });
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
    collections: [{
      slug: "posts",
      fields: [{ name: "title", type: "text", required: true }],
      hooks: {
        beforeChange: ({ operation, data }) => {
          order.push(`before:${operation}`);
          return { title: `${data.title}!` };
        },
        afterChange: ({ operation }) => { order.push(`after:${operation}`); },
        beforeDelete: ({ id }) => { order.push(`before:delete:${id}`); },
        afterDelete: ({ id }) => { order.push(`after:delete:${id}`); },
      },
    }],
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
    collections: [{
      slug: "posts",
      fields: [{ name: "title", type: "text", required: true }],
      hooks: {
        beforeChange: ({ data }) => {
          if (data.title === "blocked") throw new Error("blocked by hook");
        },
      },
    }],
  });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });

  await assert.rejects(client.posts.create({ title: "blocked" }), /blocked by hook/);
  assert.equal(fake.rows.size, 0);
});

test("an after hook failure reports that the local write already happened", async () => {
  const config = defineConfig({
    collections: [{
      slug: "posts",
      fields: [{ name: "title", type: "text", required: true }],
      hooks: {
        afterChange: () => { throw new Error("after hook failed"); },
      },
    }],
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
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text" }] }],
  });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });
  let receivedCode: string | undefined;
  client.onMutationError((event) => { receivedCode = event.code; });
  fake.events[0]?.({ code: "permission_denied", reason: "denied", transaction: undefined as never });
  assert.equal(receivedCode, "permission_denied");
});
