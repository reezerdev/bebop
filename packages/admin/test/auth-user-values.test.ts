import assert from "node:assert/strict";
import test from "node:test";
import { authUserFormDefaults, authUserProfileData, authUserProfileFields, primaryAuthRole } from "../src/ui/admin/auth-user-values.js";
import { makeCollection } from "./fixtures.js";

const collection = makeCollection([
  { name: "name", label: "Name", kind: "text", storageName: "name", required: true },
  { name: "department", label: "Department", kind: "text", storageName: "department", required: false },
  { name: "active", label: "Active", kind: "boolean", storageName: "active", required: false },
  { name: "avatar", label: "Avatar", kind: "upload", storageName: "avatar", required: false },
], { slug: "users", auth: true });

test("auth profile fields omit unsupported fields and role normalization prefers admin", () => {
  assert.deepEqual(authUserProfileFields(collection).map((field) => field.name), ["department", "active"]);
  assert.equal(primaryAuthRole(["member", "admin"]), "admin");
  assert.equal(primaryAuthRole(" member, guest "), "member");
  assert.equal(primaryAuthRole(undefined), "user");
});

test("auth defaults and profile changes preserve booleans and send only changed fields", () => {
  const defaults = authUserFormDefaults(collection, {
    id: "user-1", name: "Ada", email: "ada@example.test", role: ["member", "admin"],
    emailVerified: true, department: "Engineering", active: true,
  });
  assert.equal(defaults.role, "admin");
  assert.equal(defaults.active, true);
  assert.equal(defaults.password, "");

  assert.deepEqual(authUserProfileData(collection, {
    ...defaults,
    department: "Research",
    active: false,
  }, { department: "Engineering", active: true }), {
    department: "Research",
    active: false,
  });
  assert.deepEqual(authUserProfileData(collection, {
    ...defaults,
    department: "",
    active: false,
  }), { active: false });
});
