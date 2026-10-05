import type { BebopAdminCollection, BebopAdminField, BebopAdminStoredField } from "../../types.js";
import type { BebopAdminProps } from "./types.js";
import type { AdminRecord } from "./data-access.js";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDate(value: unknown, includeTime = false): string {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return (includeTime ? dateTimeFormatter : dateFormatter).format(date);
}

export function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

export function selectLabel(field: BebopAdminField, value: string): string {
  return ("optionLabels" in field ? field.optionLabels?.[value] : undefined) ?? humanize(value);
}

export function valueFor(field: BebopAdminField, row: AdminRecord): unknown {
  return field.kind === "join" ? undefined : row[field.storageName];
}

export function fieldByName(collection: BebopAdminCollection, name: string): BebopAdminField | undefined {
  return collection.fields.find((field) => field.name === name);
}

export function storedFields(collection: BebopAdminCollection): BebopAdminStoredField[] {
  return collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join");
}

export function collectionTitleFields(collection: BebopAdminCollection): BebopAdminStoredField[] {
  const names = collection.useAsTitle === undefined
    ? []
    : typeof collection.useAsTitle === "string" ? [collection.useAsTitle] : collection.useAsTitle;
  return names.flatMap((name) => {
    const field = fieldByName(collection, name);
    return field && field.kind !== "join" ? [field] : [];
  });
}

export function composeCollectionTitle(
  collection: BebopAdminCollection,
  readValue: (field: BebopAdminStoredField) => unknown,
  relationOptions?: BebopAdminProps["relationOptions"],
): string | undefined {
  const parts = collectionTitleFields(collection).flatMap((field) => {
    const value = readValue(field);
    if (value === null || value === undefined || value === "") return [];
    if (field.kind === "relation" || field.kind === "upload") {
      const label = relationOptions?.[field.relationTo ?? ""]?.find((option) => option.id === value)?.name;
      return [label ?? String(value)];
    }
    return [field.kind === "select" ? selectLabel(field, String(value)) : String(value)];
  });
  const title = parts.join(" · ").trim();
  return title || undefined;
}

export function recordTitle(collection: BebopAdminCollection, row: AdminRecord, relationOptions?: BebopAdminProps["relationOptions"]): string | undefined {
  return composeCollectionTitle(collection, (field) => valueFor(field, row), relationOptions);
}
