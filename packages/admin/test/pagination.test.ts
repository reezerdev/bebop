import assert from "node:assert/strict";
import test from "node:test";
import { pageWithLookahead } from "../src/ui/admin/pagination.js";

test("admin page lookahead returns at most pageSize rows and signals one more page", () => {
  const rows = Array.from({ length: 26 }, (_, index) => index);
  assert.deepEqual(pageWithLookahead(rows, 25), { rows: rows.slice(0, 25), hasNextPage: true });
  assert.deepEqual(pageWithLookahead(rows.slice(0, 25), 25), { rows: rows.slice(0, 25), hasNextPage: false });
});
