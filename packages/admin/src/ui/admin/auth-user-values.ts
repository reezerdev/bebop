import type { BebopAdminCollection, BebopAdminStoredField } from "../../types.js";

export type AuthUserFormValues = {
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  password: string;
  [field: string]: string | boolean;
};

const authUserBuiltinFieldNames = new Set([
  "id", "name", "email", "emailVerified", "role", "banned", "banReason", "banExpires", "createdAt", "updatedAt",
]);

export function authUserProfileFields(collection: BebopAdminCollection): BebopAdminStoredField[] {
  return collection.fields.filter((field): field is BebopAdminStoredField =>
    (field.name === "image" || !authUserBuiltinFieldNames.has(field.name)) &&
    (field.kind === "text" || field.kind === "select" || field.kind === "boolean" || field.kind === "upload"),
  ).sort((left, right) => Number(left.name === "image") - Number(right.name === "image"));
}

export function authUserFormDefaults(collection: BebopAdminCollection, user?: Record<string, unknown>): AuthUserFormValues {
  const values: AuthUserFormValues = {
    name: String(user?.name ?? ""),
    email: String(user?.email ?? ""),
    role: primaryAuthRole(user?.role),
    emailVerified: user?.emailVerified === true,
    password: "",
  };
  for (const field of authUserProfileFields(collection)) {
    const value = user?.[field.storageName];
    values[field.name] = field.kind === "boolean" ? value === true : String(value ?? "");
  }
  return values;
}

export function authUserProfileData(collection: BebopAdminCollection, values: AuthUserFormValues, existingUser?: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of authUserProfileFields(collection)) {
    const value = values[field.name] ?? (field.kind === "boolean" ? false : "");
    if (existingUser) {
      const previousValue = existingUser[field.storageName] ?? (field.kind === "boolean" ? false : "");
      if (!Object.is(value, previousValue)) data[field.storageName] = value;
    } else if (field.required || value !== "") {
      data[field.storageName] = value;
    }
  }
  return data;
}

export function primaryAuthRole(value: unknown): string {
  const roles = (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map((role) => String(role).trim())
    .filter(Boolean);
  return roles.includes("admin") ? "admin" : roles[0] ?? "user";
}
