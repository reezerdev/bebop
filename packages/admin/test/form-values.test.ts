import assert from "node:assert/strict";
import test from "node:test";
import { initialValues, serializeValues } from "../src/ui/admin/form-values.js";
import { makeCollection } from "./fixtures.js";

const collection = makeCollection([
  { name: "title", label: "Title", kind: "text", storageName: "title", required: true },
  { name: "estimate", label: "Estimate", kind: "number", storageName: "estimate", required: false },
  { name: "done", label: "Done", kind: "boolean", storageName: "done", required: false },
  { name: "dueAt", label: "Due At", kind: "date", storageName: "due_at", required: false, admin: { date: { pickerAppearance: "dayAndTime" } } },
  { name: "metadata", label: "Metadata", kind: "json", storageName: "metadata", required: false },
  { name: "systemKey", label: "System Key", kind: "text", storageName: "system_key", required: false, generated: true },
]);

test("serialization omits blank required and generated fields while preserving false and converting optional values", () => {
  const dueAt = new Date(2026, 4, 2, 9, 5);
  const result = serializeValues(collection, {
    title: "",
    estimate: "",
    done: false,
    dueAt: "2026-05-02T09:05",
    metadata: '{"priority":"high"}',
    systemKey: "ignore",
  });

  assert.deepEqual(Object.keys(result).sort(), ["done", "due_at", "estimate", "metadata"]);
  assert.equal(result.estimate, null);
  assert.equal(result.done, false);
  assert.deepEqual(result.metadata, { priority: "high" });
  assert.ok(result.due_at instanceof Date);
  assert.equal((result.due_at as Date).getFullYear(), dueAt.getFullYear());
  assert.equal((result.due_at as Date).getMonth(), dueAt.getMonth());
  assert.equal((result.due_at as Date).getDate(), dueAt.getDate());
});

test("initial values read storage names and format date and JSON fields for inputs", () => {
  const dueAt = new Date(2026, 4, 2, 9, 5);
  const defaults = initialValues(collection, {
    id: "record-1",
    title: "Ship the admin",
    estimate: 3,
    done: false,
    due_at: dueAt,
    metadata: { priority: "high" },
    system_key: "generated",
  });

  assert.equal(defaults.title, "Ship the admin");
  assert.equal(defaults.estimate, "3");
  assert.equal(defaults.done, false);
  assert.equal(defaults.dueAt, "2026-05-02T09:05");
  assert.equal(defaults.metadata, '{\n  "priority": "high"\n}');
  assert.equal("systemKey" in defaults, false);
});
