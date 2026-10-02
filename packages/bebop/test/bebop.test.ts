import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "jazz-tools";
import { defineConfig } from "../src/bebop.ts";
import { BebopHookError, createBebopClient } from "../src/client.ts";
import { BebopValidationError } from "../src/validation.ts";
import { createBebopAdminAccessHandler } from "../src/admin-access.ts";
import { createBebopHandler } from "../src/server.ts";
import { createBebopBetterAuth } from "../src/auth.ts";
import { compileAdminManifest, compileArtifacts, compileClientFactory, compilePermissions, compileSchema, normalizeConfig } from "../src/compiler.ts";

test("admin manifest includes the configured title and field positions", () => {
  const config = defineConfig({
    collections: [{
      slug: "posts",
      labels: { singular: "Blog Post", plural: "Blog Posts" },
      fields: [
        { name: "title", type: "text", required: true, admin: { position: "main" } },
        { name: "summary", type: "text", admin: { position: "sidebar", input: "textarea" } },
        { name: "dueAt", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } } },
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
  assert.match(manifest, /"input": "textarea"/);
  assert.match(manifest, /"pickerAppearance": "dayAndTime"/);
  assert.doesNotMatch(manifest, /"sidebarFields"/);
  assert.throws(() => compileAdminManifest(defineConfig({
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text", admin: { position: "invalid" as "sidebar" } }] }],
  })), /admin\.position must be "main" or "sidebar"/);
});

test("admin titles compose ordered fields and validate every component", () => {
  const config = defineConfig({
    collections: [
      { slug: "workspaces", fields: [{ name: "name", type: "text" }] },
      { slug: "users", fields: [{ name: "name", type: "text" }] },
      {
        slug: "memberships",
        fields: [
          { name: "workspace", type: "relationship", relationTo: "workspaces" },
          { name: "user", type: "relationship", relationTo: "users" },
          { name: "role", type: "text" },
        ],
        admin: { useAsTitle: ["workspace", "user"] },
      },
    ],
  });

  const manifest = compileAdminManifest(config);
  assert.match(manifest, /"useAsTitle": \[\s*"workspace",\s*"user"\s*\]/);
  assert.match(manifest, /"defaultColumns": \[\s*"workspace",\s*"user",\s*"role"\s*\]/);
  assert.throws(() => compileAdminManifest(defineConfig({
    collections: [{
      slug: "memberships",
      fields: [{ name: "workspace", type: "text" }],
      admin: { useAsTitle: ["workspace", "missing"] },
    }],
  })), /admin\.useAsTitle references unknown field "missing"/);
});

test("admin access defaults to Better Auth admin status and supports an auth collection callback", async () => {
  const defaultHandler = createBebopAdminAccessHandler({
    config: defineConfig({ collections: [{ slug: "users", auth: true, fields: [] }] }),
    resolveSession: async () => ({ user: { id: "admin-1", name: "Ada", email: "ada@example.test", role: "admin" }, isAdmin: true }),
  });
  const defaultResponse = await defaultHandler(new Request("https://example.test/api/bebop/admin-access"));
  assert.equal(defaultResponse.status, 200);
  assert.deepEqual(await defaultResponse.json(), { allowed: true });

  const observed: unknown[] = [];
  const config = defineConfig({
    collections: [{
      slug: "users",
      auth: true,
      fields: [],
      access: {
        admin: ({ req: { user, isAdmin, url } }) => {
          observed.push({ id: user.id, role: user.role, isAdmin, url });
          return isAdmin && user.role !== "suspended";
        },
      },
    }],
  });
  const handler = createBebopAdminAccessHandler({
    config,
    resolveSession: async () => ({ user: { id: "user-1", name: "Ada", email: "ada@example.test", role: "admin" }, isAdmin: true }),
  });

  const response = await handler(new Request("https://example.test/api/bebop/admin-access"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { allowed: true });
  assert.deepEqual(observed, [{ id: "user-1", role: "admin", isAdmin: true, url: "https://example.test/api/bebop/admin-access" }]);

  const deniedHandler = createBebopAdminAccessHandler({
    config: defineConfig({ collections: [{ slug: "users", auth: true, fields: [] }] }),
    resolveSession: async () => ({ user: { id: "user-2", name: "Sam", email: "sam@example.test", role: "user" }, isAdmin: false }),
  });
  const denied = await deniedHandler(new Request("https://example.test/api/bebop/admin-access"));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { allowed: false });
});

test("admin access denies unauthenticated requests and rejects non-GET methods", async () => {
  const config = defineConfig({ collections: [{ slug: "users", auth: true, fields: [] }] });
  const handler = createBebopAdminAccessHandler({ config, resolveSession: async () => null });

  const unauthenticated = await handler(new Request("https://example.test/api/bebop/admin-access"));
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { allowed: false });

  const wrongMethod = await handler(new Request("https://example.test/api/bebop/admin-access", { method: "POST" }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");
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

test("auth collections map to Better Auth's user model and generate protected admin configuration", () => {
  const config = defineConfig({ collections: [
    {
      slug: "members",
      auth: true,
      fields: [{ name: "department", type: "text", auth: { input: true } }],
      admin: { defaultColumns: ["name", "email", "department"], listSearchableFields: ["name", "email"] },
    },
    {
      slug: "tasks",
      fields: [{ name: "owner", type: "relationship", relationTo: "members" }],
      permissions: { read: ({ collections, rule }) => { rule.where(collections.members.exists.where({ id: "user-1" })); } },
    },
  ] });
  const artifacts = compileArtifacts(config, "./bebop.config.js");
  assert.deepEqual(artifacts, compileArtifacts(config, "./bebop.config.js"));
  assert.match(artifacts.schema, /\.\.\.betterAuthSchema/);
  assert.doesNotMatch(artifacts.schema, /"members": s\.table/);
  assert.match(artifacts.schema, /s\.rel\("better_auth_user", "ownerId"\)/);
  assert.match(artifacts.adminManifest, /"auth": true/);
  assert.match(artifacts.adminManifest, /"slug": "members"/);
  assert.match(artifacts.adminManifest, /"name": "email"/);
  assert.match(artifacts.permissions, /policy\.better_auth_user\.exists\.where/);
  assert.match(artifacts.authGenerateConfig!, /createBebopBetterAuth/);
  assert.match(artifacts.authGenerateConfig!, /schema generation cannot query the database/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "users", auth: true, fields: [] },
    { slug: "members", auth: true, fields: [] },
  ] })), /Only one collection can set auth/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "users", auth: "true" as unknown as true, fields: [] },
  ] })), /auth must be true/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "users", auth: true, fields: [], access: { read: () => true } },
  ] })), /cannot define access\.read/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "tasks", fields: [{ name: "title", type: "text" }], access: { admin: () => true } },
  ] })), /access\.admin only when it has auth: true/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "users", auth: true, fields: [{ name: "role", type: "text" }] },
  ] })), /provided by Better Auth/);
  assert.throws(() => compileAdminManifest(defineConfig({ collections: [
    { slug: "users", auth: true, fields: [], admin: { listSearchableFields: ["department"] } },
  ] })), /search supports only the "name" and "email" fields/);
});

test("Better Auth helper installs plugins and promotes only the first auth user to admin", async () => {
  const auth = createBebopBetterAuth({
    config: defineConfig({ collections: [{
      slug: "users",
      auth: true,
      fields: [
        { name: "department", type: "text" },
        { name: "publicCode", type: "text", auth: { input: true } },
      ],
    }] }),
    baseURL: "http://127.0.0.1:3000",
    secret: "bebop-test-secret-that-is-at-least-32-characters-long",
    options: {
      databaseHooks: {
        user: {
          create: {
            before: async (user) => ({ data: { displayName: user.name } }),
          },
        },
      },
    },
    jazz: { db: async () => ({} as never), schema: {} as never },
  });

  const fields = auth.options.user?.additionalFields as Record<string, { input?: boolean; type?: string }>;
  assert.equal(fields.department.type, "string");
  assert.equal(fields.department.input, false);
  assert.equal(fields.publicCode.input, true);
  assert.deepEqual(auth.options.plugins?.map((plugin) => plugin.id), ["jwt", "admin"]);
  assert.equal(typeof auth.api.getToken, "function");

  const beforeCreate = auth.options.databaseHooks?.user?.create?.before;
  assert.ok(beforeCreate);
  const makeContext = (hasUser: boolean) => ({
    context: { internalAdapter: { listUsers: async (limit: number) => limit === 1 && hasUser ? [{ id: "existing-user" }] : [] } },
  }) as never;
  const newUser = { name: "Ada", role: "user" } as never;

  assert.deepEqual(await beforeCreate(newUser, makeContext(false)), {
    data: { name: "Ada", displayName: "Ada", role: "admin" },
  });
  assert.deepEqual(await beforeCreate(newUser, makeContext(true)), {
    data: { displayName: "Ada" },
  });
});

test("permission generation compiles configured Jazz rules and defaults omitted operations to authenticated sessions", () => {
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
  assert.match(permissions, /policy\.posts\.allowUpdate\.where\(authenticatedSession\)/);
  assert.match(permissions, /policy\.posts\.allowDelete\.where\(authenticatedSession\)/);
  assert.doesNotMatch(permissions, /policy\.posts\.allow\w+\.always\(\)/);
  assert.equal(permissions, compilePermissions(config, "./config.js"));
});

test("role and trusted-claim admins bypass configured and omitted CRUD rules", () => {
  const config = defineConfig({ collections: [
    {
      slug: "tasks",
      fields: [{ name: "workspaceId", type: "text" }],
      permissions: {
        read: ({ rule }) => rule.where((task) => ({ workspaceId: task.workspaceId })),
        insert: ({ rule }) => rule.where({ workspaceId: "workspace-1" }),
      },
    },
    {
      slug: "privateNotes",
      fields: [{ name: "body", type: "text" }],
      permissions: { insert: ({ rule }) => rule.always() },
    },
    {
      slug: "legacyRecords",
      fields: [{ name: "ownerId", type: "text" }],
      access: { read: ({ session }) => ({ ownerId: session.user.account }) },
    },
  ] });

  const permissions = compilePermissions(config);
  assert.match(permissions, /const bebopAdmin = anyOf\(\[session\.where\(\{ "claims\.role": "admin" \}\), session\.where\(\{ "claims\.bebopAdmin": true \}\)\]\)/);
  assert.match(permissions, /rule: bebopRule\(policy\.tasks\.allowRead, true\)/);
  assert.match(permissions, /const adminAwareInput = \(input: unknown\) => typeof input === "function"/);
  assert.match(permissions, /policy\.privateNotes\.allowRead\.where\(bebopAdmin\)/);
  assert.match(permissions, /return anyOf\(\[bebopAdmin, configuredRule\]\)/);
  assert.match(permissions, /rule: bebopRule\(policy\.tasks\.allowInsert, true\)/);
  assert.match(permissions, /rule: bebopRule\(policy\.tasks\.allowUpdate, true\)/);
  assert.match(permissions, /rule: bebopRule\(policy\.tasks\.allowDelete, true\)/);
  assert.match(permissions, /legacyRecordsAccess\.read!\(\{ row, session, allOf, anyOf, exists, isCreator \}\)/);
});

test("boolean access callbacks compile to Jazz allow and deny expressions", () => {
  const permissions = compilePermissions(defineConfig({ collections: [{
    slug: "posts",
    fields: [{ name: "title", type: "text" }],
    access: {
      read: () => true,
      delete: () => false,
    },
  }] }));

  assert.match(permissions, /typeof result === "boolean" \? \(result \? allOf\(\[\]\) : anyOf\(\[\]\)\)/);
  assert.match(permissions, /policy\.posts\.allowUpdate\.where\(authenticatedSession\)/);
});

test("omitted and empty access rules default every operation to authenticated sessions", () => {
  const config = defineConfig({
    collections: [
      { slug: "posts", fields: [{ name: "title", type: "text" }] },
      { slug: "privateNotes", access: {}, fields: [{ name: "body", type: "text" }] },
    ],
  });

  const permissions = compilePermissions(config);
  for (const collection of ["posts", "privateNotes"]) {
    for (const operation of ["Read", "Insert", "Update", "Delete"]) {
      assert.match(permissions, new RegExp(`policy\\.${collection}\\.allow${operation}\\.where\\(authenticatedSession\\)`));
    }
  }
  assert.doesNotMatch(permissions, /policy\.(?:posts|privateNotes)\.allow\w+\.always\(\)/);
  assert.match(permissions, /Unspecified access defaults to authenticated sessions/);
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

test("authenticated access grants only non-anonymous Jazz sessions", () => {
  const config = defineConfig({
    collections: [{ slug: "posts", fields: [{ name: "title", type: "text" }], access: "authenticated" }],
  });
  const permissions = compilePermissions(config);
  assert.match(permissions, /session\.where\(\{ authMode: \{ in: \["external", "local-first"\] \} \}\)/);
  for (const operation of ["Read", "Insert", "Update", "Delete"]) {
    assert.match(permissions, new RegExp(`policy\\.posts\\.allow${operation}\\.where\\(authenticatedSession\\)`));
  }
  assert.doesNotMatch(permissions, /allow.*\.always\(\)/);
});

test("upload bytes use the Media collection's own permission rules", () => {
  const config = defineConfig({ collections: [
    { slug: "media", upload: true, access: "public", fields: [{ name: "alt", type: "text" }] },
    { slug: "tasks", access: "authenticated", fields: [{ name: "title", type: "text" }] },
  ] });
  const permissions = compilePermissions(config);
  assert.match(permissions, /\(\{ policy, session \}\)/);
  assert.match(permissions, /policy\.tasks\.allowRead\.where\(authenticatedSession\)/);
  assert.doesNotMatch(permissions, /bebop_files_media|bebop_file_parts_media|allowedTo/);
});

test("command collections deny deployed direct writes and retain a policy reference artifact", () => {
  const config = defineConfig({ collections: [{
    slug: "privateNotes",
    writeMode: "command",
    access: "public",
    fields: [{ name: "body", type: "text", required: true }],
  }] });
  const artifacts = compileArtifacts(config);
  assert.match(artifacts.permissions, /policy\.privateNotes\.allowRead\.always\(\)/);
  assert.match(artifacts.authorizationPermissions, /Reference only\. Do not deploy this policy/);
  for (const operation of ["Insert", "Update", "Delete"]) {
    assert.match(artifacts.permissions, new RegExp(`policy\\.privateNotes\\.allow${operation}\\.never\\(\\)`));
    assert.match(artifacts.authorizationPermissions, new RegExp(`policy\\.privateNotes\\.allow${operation}\\.always\\(\\)`));
  }
  assert.match(artifacts.adminManifest, /"writeMode": "command"/);
  assert.equal(artifacts.authorizationPermissions, compileArtifacts(config).authorizationPermissions);
});

test("command collections keep authenticated reads while deployed direct writes stay blocked", () => {
  const artifacts = compileArtifacts(defineConfig({ collections: [{
    slug: "memberships",
    writeMode: "command",
    fields: [{ name: "userId", type: "text", required: true }],
  }] }));

  assert.match(artifacts.permissions, /policy\.memberships\.allowRead\.where\(authenticatedSession\)/);
  for (const operation of ["Insert", "Update", "Delete"]) {
    assert.match(artifacts.permissions, new RegExp(`policy\\.memberships\\.allow${operation}\\.never\\(\\)`));
    assert.match(artifacts.authorizationPermissions, new RegExp(`policy\\.memberships\\.allow${operation}\\.where\\(authenticatedSession\\)`));
  }
});

test("command collection read callbacks can return booleans", () => {
  const artifacts = compileArtifacts(defineConfig({ collections: [{
    slug: "memberships",
    writeMode: "command",
    fields: [{ name: "userId", type: "text", required: true }],
    access: { read: () => false },
  }] }));

  assert.match(artifacts.permissions, /const configuredRule = typeof result === "boolean" \? \(result \? allOf\(\[\]\) : anyOf\(\[\]\)\)/);
  assert.match(artifacts.permissions, /return anyOf\(\[bebopAdmin, configuredRule\]\)/);
  assert.match(artifacts.authorizationPermissions, /const configuredRule = typeof result === "boolean" \? \(result \? allOf\(\[\]\) : anyOf\(\[\]\)\)/);
});

test("text and numeric validation constraints are checked in the shared client", async () => {
  const config = defineConfig({ collections: [{
    slug: "posts",
    fields: [
      { name: "title", type: "text", required: true, minLength: 3, maxLength: 8, validate: (value) => value?.includes("bad") ? "Choose a different title." : true },
      { name: "rank", type: "number", min: 1, max: 5 },
    ],
  }] });
  const fake = createFakeDb();
  const client = createBebopClient({ app: fake.app as never, config, db: fake.db });

  await assert.rejects(client.posts.create({ title: "ab", rank: 2 }), (error: unknown) => {
    assert.ok(error instanceof BebopValidationError);
    assert.equal(error.fieldErrors.title, "Title must be at least 3 characters.");
    return true;
  });
  await assert.rejects(client.posts.create({ title: "bad", rank: 2 }), (error: unknown) => {
    assert.ok(error instanceof BebopValidationError);
    assert.equal(error.fieldErrors.title, "Choose a different title.");
    return true;
  });
  await assert.rejects(client.posts.create({ title: "valid", rank: 6 }), (error: unknown) => {
    assert.ok(error instanceof BebopValidationError);
    assert.equal(error.fieldErrors.rank, "Rank must be at most 5.");
    return true;
  });
  assert.equal(fake.rows.size, 0);
  assert.throws(() => compileSchema(defineConfig({ collections: [{
    slug: "posts", fields: [{ name: "rank", type: "number", min: 6, max: 2 }],
  }] })), /min cannot exceed max/);
});

test("command client delegates mutations and reports global durability", async () => {
  const config = defineConfig({ collections: [{
    slug: "posts", writeMode: "command", access: "public",
    fields: [{ name: "title", type: "text", required: true }],
  }] });
  const fake = createFakeDb();
  const requests: unknown[] = [];
  const client = createBebopClient({
    app: fake.app as never,
    config,
    db: fake.db,
    commandTransport: async (request) => {
      requests.push(request);
      return { doc: { id: "server-1", title: "Saved", $createdAt: new Date().toISOString() } };
    },
  });
  const created = await client.posts.create({ title: "Saved" });
  assert.equal(created.durability, "global");
  await created.waitForGlobal();
  assert.equal(created.doc.id, "server-1");
  assert.equal(fake.rows.size, 0);
  assert.deepEqual(requests, [{ collection: "posts", operation: "create", data: { title: "Saved" } }]);
});

test("search builds filtered Jazz union pages and per-field ID queries", () => {
  const config = defineConfig({ collections: [{
    slug: "tasks",
    fields: [{ name: "name", type: "text" }, { name: "content", type: "text" }, { name: "status", type: "select", options: ["todo", "done"] }],
    admin: { listSearchableFields: ["name", "content"] },
  }] });
  const fake = createFakeDb();
  let arms: Record<string, { condition: Record<string, unknown> }> = {};
  const unionOperations: unknown[][] = [];
  const unionQuery = {
    orderBy: (field: string, direction?: string) => { unionOperations.push(["orderBy", field, direction]); return unionQuery; },
    limit: (value: number) => { unionOperations.push(["limit", value]); return unionQuery; },
    offset: (value: number) => { unionOperations.push(["offset", value]); return unionQuery; },
  };
  const app = { tasks: fake.app.posts, union: (queries: Record<string, { condition: Record<string, unknown> }>) => { arms = queries; return unionQuery; } };
  const client = createBebopClient({ app: app as never, config, db: fake.db });
  client.tasks.search({ search: "jazz", fields: ["name", "content"], where: { status: "todo" }, orderBy: { field: "name", direction: "desc" }, limit: 25, offset: 50 });
  assert.deepEqual(Object.keys(arms), ["field_0", "field_1"]);
  assert.deepEqual(arms.field_0?.condition, { status: "todo", name: { contains: "jazz" } });
  assert.deepEqual(arms.field_1?.condition, { status: "todo", content: { contains: "jazz" } });
  assert.deepEqual(unionOperations, [["orderBy", "name", "desc"], ["limit", 25], ["offset", 50]]);
  const ids = client.tasks.searchIds({ search: "jazz", fields: ["name", "content"], where: { status: "todo" } });
  assert.equal(ids.length, 2);
  assert.deepEqual((ids[0] as unknown as { operations: unknown[][] }).operations, [
    ["select", "id"], ["where", { status: "todo", name: { contains: "jazz" } }],
  ]);
});

test("multi-field search pages 10,000 rows, deduplicates matches, and counts with IDs only", async () => {
  type Row = { id: string; name: string; content: string; status: string };
  type Query = {
    columns: string[];
    condition: Record<string, unknown>;
    order?: { field: string; direction: string };
    limitValue?: number;
    offsetValue?: number;
    arms?: Query[];
    where: (condition: Record<string, unknown>) => Query;
    orderBy: (field: string, direction?: string) => Query;
    limit: (value: number) => Query;
    offset: (value: number) => Query;
    execute: (rows: readonly Row[]) => Record<string, unknown>[];
  };
  const data: Row[] = Array.from({ length: 10_000 }, (_, index) => ({
    id: `task-${String(index).padStart(5, "0")}`,
    name: `Task ${String(index).padStart(5, "0")}${index % 101 === 0 ? " needle" : ""}`,
    content: `Content ${String(index).padStart(5, "0")}${index % 37 === 0 ? " needle" : ""}`,
    status: index % 3 === 0 ? "done" : "todo",
  }));
  const matches = (row: Row, condition: Record<string, unknown>) => Object.entries(condition).every(([field, expected]) => {
    if (expected && typeof expected === "object" && "contains" in expected) {
      return String(row[field as keyof Row]).includes(String((expected as { contains: unknown }).contains));
    }
    return row[field as keyof Row] === expected;
  });
  const makeQuery = (columns: string[], condition: Record<string, unknown> = {}): Query => {
    const query: Query = {
      columns,
      condition,
      where(next) { query.condition = { ...query.condition, ...next }; return query; },
      orderBy(field, direction = "asc") { query.order = { field, direction }; return query; },
      limit(value) { query.limitValue = value; return query; },
      offset(value) { query.offsetValue = value; return query; },
      execute(rows) {
        let found = rows.filter((row) => matches(row, query.condition));
        if (query.order) {
          const { field, direction } = query.order;
          found = [...found].sort((left, right) => String(left[field as keyof Row]).localeCompare(String(right[field as keyof Row])) * (direction === "desc" ? -1 : 1));
        }
        found = found.slice(query.offsetValue ?? 0, query.limitValue === undefined ? undefined : (query.offsetValue ?? 0) + query.limitValue);
        return found.map((row) => columns.length === 1 && columns[0] === "id" ? { id: row.id } : { ...row });
      },
    };
    return query;
  };
  const table = {
    where: (condition: Record<string, unknown>) => makeQuery(["*"], condition),
    select: (...columns: string[]) => makeQuery(columns),
  };
  const app = {
    tasks: table,
    union: (arms: Record<string, Query>) => {
      const query = makeQuery(["*"]);
      query.arms = Object.values(arms);
      query.orderBy = (field, direction = "asc") => { query.order = { field, direction }; return query; };
      query.limit = (value) => { query.limitValue = value; return query; };
      query.offset = (value) => { query.offsetValue = value; return query; };
      query.execute = (rows) => {
        const unique = new Map<string, Row>();
        for (const arm of query.arms ?? []) for (const row of arm.execute(rows) as Row[]) unique.set(row.id, row);
        let found = [...unique.values()];
        if (query.order) {
          const { field, direction } = query.order;
          found.sort((left, right) => String(left[field as keyof Row]).localeCompare(String(right[field as keyof Row])) * (direction === "desc" ? -1 : 1));
        }
        found = found.slice(query.offsetValue ?? 0, query.limitValue === undefined ? undefined : (query.offsetValue ?? 0) + query.limitValue);
        return found.map((row) => ({ ...row }));
      };
      return query;
    },
  };
  const fakeDb = {
    all: async (query: Query) => query.execute(data),
    one: async () => null,
    onMutationError: () => () => {},
  } as unknown as Db;
  const config = defineConfig({ collections: [{
    slug: "tasks",
    fields: [
      { name: "name", type: "text" },
      { name: "content", type: "text" },
      { name: "status", type: "select", options: ["todo", "done"] },
    ],
    admin: { listSearchableFields: ["name", "content"] },
  }] });
  const client = createBebopClient({ app: app as never, config, db: fakeDb });
  const options = {
    search: "needle",
    fields: ["name", "content"] as const,
    where: { status: "todo" },
    orderBy: { field: "name", direction: "asc" as const },
    limit: 20,
    offset: 30,
  };
  const page = await fakeDb.all(client.tasks.search(options) as unknown as Query) as Row[];
  const expected = data
    .filter((row) => row.status === "todo" && (row.name.includes("needle") || row.content.includes("needle")))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(30, 50);
  assert.equal(page.length, 20);
  assert.deepEqual(page.map((row) => row.id), expected.map((row) => row.id));

  const idPages = await Promise.all(client.tasks.searchIds(options).map((query) => fakeDb.all(query as unknown as Query)));
  const ids = new Set(idPages.flatMap((items) => items.map((item) => String(item.id))));
  assert.equal(ids.size, data.filter((row) => row.status === "todo" && (row.name.includes("needle") || row.content.includes("needle"))).length);
  assert.ok(idPages.flat().every((row) => Object.keys(row).length === 1 && "id" in row));
});

test("command handler checks access, runs hooks, and responds only after global confirmation", async () => {
  const order: string[] = [];
  const config = defineConfig({ collections: [{
    slug: "tasks", writeMode: "command", access: "public",
    fields: [{ name: "title", type: "text", required: true, minLength: 3 }],
    hooks: {
      beforeChange: ({ data }) => { order.push("before"); return { title: `${data.title} updated` }; },
      afterChange: () => { order.push("after"); },
    },
  }] });
  const fake = createFakeDb();
  const authDb = {
    one: async () => null,
    canInsert: async () => { throw new Error("The deployed Jazz policy denies direct writes."); },
  };
  const writeDb = {
    insert: (_table: unknown, data: Record<string, unknown>) => {
      order.push("local");
      return {
        value: { id: "task-1", ...data },
        wait: async ({ tier }: { tier: string }) => { order.push(tier); },
      };
    },
    one: async () => null,
  };
  const handle = createBebopHandler({
    app: { tasks: fake.app.posts } as never,
    config,
    authorize: ({ data }) => {
      order.push(data?.title === "New task" ? "authorize-input" : "authorize-final");
      return true;
    },
    resolveSession: async () => ({ authorizationDb: authDb as never, writeDb: writeDb as never, userId: "user-1" }),
  });
  const response = await handle(new Request("https://example.test/api/bebop/collections/tasks", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New task" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(order, ["authorize-input", "before", "authorize-final", "local", "global", "after"]);
  assert.equal((await response.json() as { doc: { title: string } }).doc.title, "New task updated");

  const denied = createBebopHandler({
    app: { tasks: fake.app.posts } as never,
    config,
    authorize: () => false,
    resolveSession: async () => ({ authorizationDb: authDb as never, writeDb: writeDb as never, userId: "user-1" }),
  });
  const deniedResponse = await denied(new Request("https://example.test/api/bebop/collections/tasks", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New task" }),
  }));
  assert.equal(deniedResponse.status, 403);
  assert.deepEqual(order, ["authorize-input", "before", "authorize-final", "local", "global", "after"]);

  const transformDenied = createBebopHandler({
    app: { tasks: fake.app.posts } as never,
    config,
    authorize: ({ data }) => data?.title === "New task",
    resolveSession: async () => ({ authorizationDb: authDb as never, writeDb: writeDb as never, userId: "user-1" }),
  });
  const transformDeniedResponse = await transformDenied(new Request("https://example.test/api/bebop/collections/tasks", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New task" }),
  }));
  assert.equal(transformDeniedResponse.status, 403);
  assert.deepEqual(order.slice(-1), ["before"]);
});

test("permission callbacks can build correlated exists rules against another collection", () => {
  const config = defineConfig({
    collections: [{
      slug: "workspaces",
      fields: [{ name: "name", type: "text" }],
      access: {
        read: ({ row, session, exists }) => exists("workspaceMemberships", {
          workspaceId: row.id,
          userAccount: session.user.account,
          status: "active",
        }),
      },
    }, {
      slug: "workspaceMemberships",
      fields: [
        { name: "workspace", type: "relationship", relationTo: "workspaces" },
        { name: "userAccount", type: "text" },
        { name: "status", type: "select", options: ["active", "pending"] },
      ],
    }],
  });

  const permissions = compilePermissions(config, "./config.js");
  assert.match(permissions, /const exists = \(collectionName: string/);
  assert.match(permissions, /Unknown collection in access\.exists\(\): \$\{collectionName\}/);
  assert.match(permissions, /read!\(\{ row, session, allOf, anyOf, exists, isCreator \}\)/);
  const observed: unknown[] = [];
  const access = config.collections[0]?.access;
  if (access && access !== "public" && access !== "authenticated") {
    access.read?.({
      row: { id: "workspace-1" } as never,
      session: { user: { account: "account-1" } } as never,
      allOf: (() => ({}) as never),
      anyOf: (() => ({}) as never),
      exists: (collectionName, condition) => {
        observed.push(collectionName, condition);
        return {} as never;
      },
      isCreator: {} as never,
    });
  }
  assert.deepEqual(observed, ["workspaceMemberships", {
    workspaceId: "workspace-1",
    userAccount: "account-1",
    status: "active",
  }]);
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

test("join fields compile as virtual Jazz reverse relations and manifest metadata", () => {
  const config = defineConfig({
    collections: [
      {
        slug: "workspaces",
        fields: [
          { name: "name", type: "text", required: true },
          { name: "members", label: "Members", type: "join", collection: "workspaceMemberships", on: "workspace", admin: { defaultColumns: ["user", "role"], allowCreate: false } },
        ],
        admin: { defaultColumns: ["name"] },
      },
      {
        slug: "workspaceMemberships",
        fields: [
          { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
          { name: "user", type: "text", required: true },
          { name: "role", type: "text" },
        ],
      },
    ],
  });

  const schema = compileSchema(config);
  const manifest = compileAdminManifest(config);
  assert.equal(schema, compileSchema(config));
  assert.equal(manifest, compileAdminManifest(config));
  assert.match(schema, /"members": s\.reverse\("workspaceMemberships", "workspace"\)/);
  assert.doesNotMatch(schema, /"members": s\.(?:string|uuid|timestamp|json|int|float|boolean|enum)/);
  assert.match(manifest, /"kind": "join"/);
  assert.match(manifest, /"collection": "workspaceMemberships"/);
  assert.match(manifest, /"on": "workspace"/);
  assert.match(manifest, /"defaultColumns": \[\s*"user",\s*"role"\s*\]/);
  assert.match(manifest, /"allowCreate": false/);
});

test("join fields require a direct relationship back to the declaring collection", () => {
  const base = {
    slug: "workspaces",
    fields: [{ name: "name", type: "text" }, { name: "members", type: "join", collection: "memberships", on: "workspace" }],
  } as const;
  const compileWithTarget = (target: { slug: string; fields: readonly { name: string; type: string; relationTo?: string }[] }) =>
    compileSchema(defineConfig({ collections: [base, target] as never }));

  assert.throws(() => compileWithTarget({ slug: "other", fields: [{ name: "workspace", type: "relationship", relationTo: "workspaces" }] }), /targets unknown collection "memberships"/);
  assert.throws(() => compileWithTarget({ slug: "memberships", fields: [{ name: "other", type: "relationship", relationTo: "workspaces" }] }), /references missing field "memberships.workspace"/);
  assert.throws(() => compileWithTarget({ slug: "memberships", fields: [{ name: "workspace", type: "text" }] }), /must be a relationship/);
  assert.throws(() => compileWithTarget({ slug: "memberships", fields: [{ name: "workspace", type: "relationship", relationTo: "other" }] }), /must relate to "workspaces"/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { ...base, fields: [{ name: "name", type: "text" }, { name: "members", type: "join", collection: "memberships", on: "workspace", admin: { defaultColumns: ["missing"] } }] },
    { slug: "memberships", fields: [{ name: "workspace", type: "relationship", relationTo: "workspaces" }] },
  ] as never })), /admin\.defaultColumns references unknown stored field "missing"/);
});

test("join fields are rejected as runtime mutation data", async () => {
  const config = defineConfig({ collections: [
    { slug: "workspaces", fields: [{ name: "name", type: "text", required: true }, { name: "members", type: "join", collection: "workspaceMemberships", on: "workspace" }] },
    { slug: "workspaceMemberships", fields: [{ name: "workspace", type: "relationship", relationTo: "workspaces", required: true }] },
  ] });
  const fake = createFakeDb();
  const client = createBebopClient({ app: { workspaces: fake.app.posts, workspaceMemberships: fake.app.posts } as never, config, db: fake.db });
  await assert.rejects(
    () => client.workspaces.create({ name: "Bebop", members: [] } as never),
    /Unknown workspaces write field "members"/,
  );
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
  assert.deepEqual(client.posts.where({ title: "hello" }), { table: "posts", condition: { title: "hello" } });
  const directQuery = client.posts.select("title").where({ title: "hello" }).orderBy("title", "asc").limit(10);
  assert.deepEqual((directQuery as unknown as { operations: unknown[][] }).operations, [
    ["select", "title"],
    ["where", { title: "hello" }],
    ["orderBy", "title", "asc"],
    ["limit", 10],
  ]);
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

test("upload fields generate one Media table with a hidden bytes column", () => {
  const config = defineConfig({ collections: [
    { slug: "media", upload: { mimeTypes: ["image/*"] }, fields: [{ name: "alt", type: "text" }], access: "public" },
    { slug: "tasks", fields: [{ name: "image", type: "upload", relationTo: "media" }] },
  ] });
  const artifacts = compileArtifacts(config);
  assert.deepEqual(artifacts, compileArtifacts(config));
  assert.match(artifacts.schema, /"data": s\.bytes\(\)/);
  assert.match(artifacts.schema, /"filename": s\.string\(\)/);
  assert.doesNotMatch(artifacts.schema, /bebop_files_media|bebop_file_parts_media|"fileId"/);
  assert.match(artifacts.schema, /"imageId": s\.uuid\(\)\.optional\(\)/);
  assert.match(artifacts.permissions, /policy\.media\.allowRead\.always\(\)/);
  assert.doesNotMatch(artifacts.permissions, /bebop_files_media|bebop_file_parts_media/);
  assert.match(artifacts.adminManifest, /"maxFileSize": 20971520/);
});

test("upload configuration rejects invalid targets, reserved names, and size limits", () => {
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "media", fields: [{ name: "alt", type: "text" }] },
    { slug: "tasks", fields: [{ name: "image", type: "upload", relationTo: "media" }] },
  ] })), /upload-enabled collection/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "media", upload: true, fields: [{ name: "filename", type: "text" }] },
  ] })), /Duplicate field name|conflicts with another stored field/);
  assert.throws(() => compileSchema(defineConfig({ collections: [
    { slug: "media", upload: true, fields: [{ name: "data", type: "text" }] },
  ] })), /conflicts with another stored field/);
  assert.throws(() => compileSchema(defineConfig({ upload: { limits: { fileSize: 0 } }, collections: [
    { slug: "media", upload: true, fields: [{ name: "alt", type: "text" }] },
  ] })), /fileSize must be a positive/);
});

test("upload client streams one Media row, excludes bytes from list reads, and pages file reads", async () => {
  const order: string[] = [];
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 1;
  const pageSelections: { from: number; to: number }[] = [];
  const selections: unknown[] = [];
  const project = (row: Record<string, unknown>, selection: unknown) => {
    if (Array.isArray(selection)) {
      return Object.fromEntries(selection.flatMap((field) => typeof field === "string" && field in row ? [[field, row[field]]] : []));
    }
    if (selection && typeof selection === "object") {
      const [field, range] = Object.entries(selection)[0] ?? [];
      if (field === "data" && range && typeof range === "object") {
        const { from, to } = range as { from: number; to: number };
        pageSelections.push({ from, to });
        return { data: (row.data as Uint8Array).slice(from, to) };
      }
    }
    return { ...row };
  };
  const makeTable = (name: string) => {
    const makeQuery = (selection: unknown, condition: Record<string, unknown> = {}) => ({
      name,
      selection,
      condition,
      where(nextCondition: Record<string, unknown>) { this.condition = nextCondition; return this; },
      orderBy() { return this; },
      limit() { return this; },
      offset() { return this; },
    });
    return {
      name,
      where(condition: Record<string, unknown>) { return makeQuery(undefined, condition); },
      select(...selectors: unknown[]) {
        const selection = selectors.length === 1 && !Array.isArray(selectors[0]) && typeof selectors[0] === "object"
          ? selectors[0]
          : selectors;
        selections.push(selection);
        return makeQuery(selection);
      },
    };
  };
  const mediaTable = makeTable("media");
  const write = <T>(value: T) => ({ value, wait: async () => value, txId: Promise.resolve("tx") });
  const readStream = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const size = parts.reduce((total, part) => total + part.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return bytes;
  };
  const db = {
    one: async (query: { name: string; condition: { id: string }; selection: unknown }) => {
      const row = rows.get(`${query.name}:${query.condition.id}`);
      return row ? project(row, query.selection) : null;
    },
    all: async (query: { name: string; selection: unknown }) => [...rows.entries()]
      .filter(([key]) => key.startsWith(`${query.name}:`))
      .map(([, row]) => project(row, query.selection)),
    insertStreaming: async (table: { name: string }, data: Record<string, unknown> & { data: ReadableStream<Uint8Array> }) => {
      order.push("stream-insert");
      const id = `media-${nextId++}`;
      const value = { id, ...data, data: await readStream(data.data) };
      rows.set(`${table.name}:${id}`, value);
      return write({ id });
    },
    updateStreaming: async (table: { name: string }, id: string, data: Record<string, unknown> & { data: ReadableStream<Uint8Array> }) => {
      order.push("stream-update");
      const value = { ...rows.get(`${table.name}:${id}`), ...data, data: await readStream(data.data) };
      rows.set(`${table.name}:${id}`, value);
      return write({ id });
    },
    insert: (table: { name: string }, data: Record<string, unknown>) => {
      const id = `media-${nextId++}`;
      const value = { id, ...data };
      rows.set(`${table.name}:${id}`, value);
      return write(value);
    },
    update: (table: { name: string }, id: string, data: Record<string, unknown>) => {
      rows.set(`${table.name}:${id}`, { ...rows.get(`${table.name}:${id}`), ...data });
      return write(undefined);
    },
    delete: (table: { name: string }, id: string) => { rows.delete(`${table.name}:${id}`); return write(undefined); },
    onMutationError: () => () => {},
  };
  const config = defineConfig({ upload: { limits: { fileSize: 3_000_000 } }, collections: [{
    slug: "media", upload: { mimeTypes: ["image/*"] }, fields: [{ name: "alt", type: "text" }],
    hooks: {
      beforeChange: ({ operation }) => { order.push(`before:${operation}`); return { alt: "caption" }; },
      afterChange: ({ operation }) => { order.push(`after:${operation}`); },
      beforeDelete: () => { order.push("before:delete"); },
      afterDelete: () => { order.push("after:delete"); },
    },
  }] });
  const client = createBebopClient({ app: { media: mediaTable } as never, config, db: db as unknown as Db });
  await assert.rejects(client.media.create({ file: new File([new Uint8Array(3_000_001)], "large.png", { type: "image/png" }) }), /upload limit/);
  await assert.rejects(client.media.create({ file: new File(["text"], "notes.txt", { type: "text/plain" }) }), /not allowed/);
  const firstBytes = new Uint8Array(2 * 1024 * 1024 + 17).fill(65);
  const first = await client.media.create({ file: new File([firstBytes], "first.png", { type: "image/png" }) });
  assert.equal(first.doc.filename, "first.png");
  assert.equal(first.doc.alt, "caption");
  assert.equal(rows.size, 1);
  assert.equal("fileId" in first.doc, false);
  assert.equal(Buffer.compare(Buffer.from(rows.get(`media:${first.doc.id}`)?.data as Uint8Array), Buffer.from(firstBytes)), 0);
  client.media.query();
  const selected = selections.at(-1);
  assert.ok(Array.isArray(selected));
  assert.equal(selected.includes("data"), false);
  assert.equal(rows.get(`media:${first.doc.id}`)?.data instanceof Uint8Array, true);
  assert.equal((await client.media.find())[0]?.data, undefined);
  assert.equal(Buffer.compare(Buffer.from(await (await client.media.readFile(first.doc.id))!.arrayBuffer()), Buffer.from(firstBytes)), 0);
  assert.deepEqual(pageSelections, [
    { from: 0, to: 1024 * 1024 },
    { from: 1024 * 1024, to: 2 * 1024 * 1024 },
    { from: 2 * 1024 * 1024, to: 2 * 1024 * 1024 + 17 },
  ]);
  await first.waitForGlobal();
  await assert.rejects(client.media.update(first.doc.id, { fileId: "invalid" } as never), /Unknown media write field/);
  const second = await client.media.update(first.doc.id, { file: new File(["second"], "second.png", { type: "image/png" }) });
  assert.equal(second.doc.filename, "second.png");
  assert.equal(rows.size, 1);
  assert.equal("fileId" in second.doc, false);
  assert.equal(await (await client.media.readFile(first.doc.id))?.text(), "second");
  await client.media.delete(first.doc.id);
  assert.equal(rows.size, 0);
  assert.deepEqual(order, ["before:create", "stream-insert", "after:create", "before:update", "stream-update", "after:update", "before:delete", "after:delete"]);
});
