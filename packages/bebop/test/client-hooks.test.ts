import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "jazz-tools";
import { defineConfig } from "../src/bebop.ts";
import { createBebopClient } from "../src/client.ts";

function transactionalFakeDb() {
  type Row = Record<string, unknown> & { id: string };
  type Query = { table: string; condition?: Record<string, unknown> };
  const rows = new Map<string, Row>();
  const tables = new Map<string, object>();
  const tableNames = new WeakMap<object, string>();
  let nextId = 1;

  const getTable = (name: string) => {
    const existing = tables.get(name);
    if (existing) return existing;
    const table = {
      where: (condition: Record<string, unknown>) => ({ table: name, condition }),
      select: (..._fields: string[]) => {
        const query: Query & { where: (condition: Record<string, unknown>) => Query } = {
          table: name,
          condition: {},
          where(condition) {
            query.condition = { ...query.condition, ...condition };
            return query;
          },
        };
        return query;
      },
    };
    tables.set(name, table);
    tableNames.set(table, name);
    return table;
  };
  const app = new Proxy({}, { get: (_target, name) => getTable(String(name)) });
  const matching = (source: Map<string, Row>, query: Query) => [...source.values()].filter((row) =>
    tableNames.get(getTable(query.table)) === query.table
      && [...source.keys()].includes(`${query.table}:${row.id}`)
      && Object.entries(query.condition ?? {}).every(([key, value]) => row[key] === value));
  const makeWrite = <T>(value: T) => ({ value, wait: async () => value, txId: Promise.resolve("test-tx") });

  const db = {
    one: async (query: Query) => matching(rows, query)[0] ?? null,
    all: async (query: Query) => matching(rows, query),
    insert: () => { throw new Error("The test expects writes to use a transaction."); },
    update: () => { throw new Error("The test expects writes to use a transaction."); },
    delete: () => { throw new Error("The test expects writes to use a transaction."); },
    getAuthState: () => ({ session: { claims: { sub: "test-user" } } }),
    transaction: async <T>(callback: (tx: {
      one: (query: Query) => Promise<Row | null>;
      all: (query: Query) => Promise<Row[]>;
      insert: (table: object, data: Record<string, unknown>) => Row;
      update: (table: object, id: string, data: Record<string, unknown>) => void;
      delete: (table: object, id: string) => void;
    }) => T | Promise<T>) => {
      const staged = new Map(rows);
      const tx = {
        one: async (query: Query) => matching(staged, query)[0] ?? null,
        all: async (query: Query) => matching(staged, query),
        insert: (table: object, data: Record<string, unknown>) => {
          const name = tableNames.get(table) ?? "unknown";
          const row = { id: `${name}-${nextId++}`, ...data };
          staged.set(`${name}:${row.id}`, row);
          return row;
        },
        update: (table: object, id: string, data: Record<string, unknown>) => {
          const name = tableNames.get(table) ?? "unknown";
          const key = `${name}:${id}`;
          staged.set(key, { ...staged.get(key), ...data, id });
        },
        delete: (table: object, id: string) => {
          const name = tableNames.get(table) ?? "unknown";
          staged.delete(`${name}:${id}`);
        },
      };
      const value = await callback(tx);
      rows.clear();
      staged.forEach((row, key) => rows.set(key, row));
      return makeWrite(value);
    },
    onMutationError: () => () => {},
  };

  return { app, db: db as unknown as Db, rows };
}

test("hooks stage related Bebop mutations and roll the complete operation back on failure", async () => {
  const hookOrder: string[] = [];
  const config = defineConfig({ collections: [
    {
      slug: "posts",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "auditId", type: "text", required: true, admin: { readOnly: true } },
      ],
      hooks: {
        async beforeChange({ operation, data, client, userId }) {
          if (operation !== "create") return;
          if (!client) throw new Error("Missing transaction-scoped Bebop client.");
          assert.equal(userId, "test-user");
          hookOrder.push("post:before");
          const audit = await client.auditLogs.create({ message: data.title });
          if (data.title === "related failure") await client.auditLogs.create({ message: "" });
          return { auditId: audit.id };
        },
        async afterChange({ operation, doc, client, userId }) {
          if (operation !== "create") return;
          if (!client) throw new Error("Missing transaction-scoped Bebop client.");
          assert.equal(userId, "test-user");
          assert.ok(await client.auditLogs.findById(String(doc.auditId)));
          hookOrder.push("post:after");
          if (doc.title === "after hook failure") throw new Error("post after hook failed");
        },
      },
    },
    {
      slug: "auditLogs",
      fields: [{ name: "message", type: "text", required: true }],
      hooks: {
        beforeChange: () => { hookOrder.push("audit:before"); },
        afterChange: () => { hookOrder.push("audit:after"); },
      },
    },
  ] });
  const fake = transactionalFakeDb();
  const client = createBebopClient({ app: fake.app as object, config, db: fake.db });

  const created = await client.posts.create({ title: "hello" });
  assert.equal(created.doc.auditId, "auditLogs-1");
  await created.waitForGlobal();
  assert.equal(fake.rows.size, 2);
  assert.deepEqual(hookOrder, ["post:before", "audit:before", "audit:after", "post:after"]);

  await assert.rejects(client.posts.create({ title: "related failure" }), /invalid field values/);
  assert.equal(fake.rows.size, 2);
  await assert.rejects(client.posts.create({ title: "after hook failure" }), /post after hook failed/);
  assert.equal(fake.rows.size, 2);
});
