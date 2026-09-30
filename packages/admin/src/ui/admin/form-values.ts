import type { FieldValues } from "react-hook-form";
import type { BebopAdminCollection } from "../../types.js";
import type { AdminRecord } from "./data-access.js";
import { storedFields, valueFor } from "./record-values.js";

export function initialValues(collection: BebopAdminCollection, row?: AdminRecord, defaults?: Readonly<Record<string, unknown>>): FieldValues {
  return Object.fromEntries(storedFields(collection).filter((field) => !field.generated).map((field) => {
    const value = row ? valueFor(field, row) : defaults?.[field.name];
    if (field.kind === "boolean") return [field.name, Boolean(value)];
    if (field.kind === "date") return [field.name, value instanceof Date ? localDateInput(value, field.admin?.date?.pickerAppearance === "dayAndTime") : ""];
    if (field.kind === "json") return [field.name, value === undefined || value === null ? "" : JSON.stringify(value, null, 2)];
    return [field.name, value === undefined || value === null ? "" : String(value)];
  }));
}

export function localDateInput(value: Date, includeTime = false): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  if (!includeTime) return `${year}-${month}-${day}`;
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function serializeValues(collection: BebopAdminCollection, values: FieldValues): Record<string, unknown> {
  return Object.fromEntries(storedFields(collection).filter((field) => !field.generated).flatMap((field) => {
    const raw = values[field.name];
    if (field.kind === "boolean") return [[field.storageName, Boolean(raw)]];
    if (raw === "" || raw === undefined || raw === null) return field.required ? [] : [[field.storageName, null]];
    if (field.kind === "number" || field.kind === "integer") return [[field.storageName, Number(raw)]];
    if (field.kind === "date") return [[field.storageName, new Date(field.admin?.date?.pickerAppearance === "dayAndTime" ? String(raw) : `${String(raw)}T00:00:00`)]];
    if (field.kind === "json") return [[field.storageName, JSON.parse(String(raw))]];
    return [[field.storageName, raw]];
  }));
}
