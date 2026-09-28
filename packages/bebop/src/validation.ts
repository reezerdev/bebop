import type { CollectionDefinition, Fields } from "./bebop.ts";

export type BebopValidationOperation = "create" | "update";

export class BebopValidationError extends Error {
  constructor(readonly fieldErrors: Readonly<Record<string, string>>) {
    super("The document has invalid field values.");
    this.name = "BebopValidationError";
  }
}

function storedName(field: Fields[number]): string | undefined {
  if (field.type === "join") return undefined;
  return field.type === "relationship" || field.type === "upload" ? `${field.name}Id` : field.name;
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string" && value.trim() === "";
}

function labelFor(name: string): string {
  const label = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

/** Validate Bebop constraints and custom field validators for a create or update. */
export async function validateCollectionData<TFields extends Fields>(
  collection: CollectionDefinition<TFields>,
  data: Readonly<Record<string, unknown>>,
  operation: BebopValidationOperation,
  originalDoc?: Readonly<Record<string, unknown>>,
): Promise<void> {
  const effectiveData = operation === "update" ? { ...originalDoc, ...data } : { ...data };
  const errors: Record<string, string> = {};
  const context = { operation, data: effectiveData, ...(originalDoc ? { originalDoc } : {}) };

  for (const field of collection.fields) {
    if (field.type === "join") continue;
    const name = storedName(field);
    if (!name) continue;
    const label = field.label ?? labelFor(field.name);
    const value = effectiveData[name];

    if (field.required && isMissing(value) && (operation === "create" || originalDoc !== undefined || Object.hasOwn(data, name))) {
      errors[field.name] = `${label} is required.`;
      continue;
    }
    if (isMissing(value)) continue;

    if (field.type === "text") {
      if (typeof value !== "string") {
        errors[field.name] = `${label} must be text.`;
        continue;
      }
      if (field.minLength !== undefined && value.length < field.minLength) {
        errors[field.name] = `${label} must be at least ${field.minLength} characters.`;
        continue;
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors[field.name] = `${label} must be at most ${field.maxLength} characters.`;
        continue;
      }
      const result = await field.validate?.(value, context);
      if (typeof result === "string") errors[field.name] = result;
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors[field.name] = `${label} must be a finite number.`;
        continue;
      }
      if (field.integer && !Number.isInteger(value)) {
        errors[field.name] = `${label} must be an integer.`;
        continue;
      }
      if (field.min !== undefined && value < field.min) {
        errors[field.name] = `${label} must be at least ${field.min}.`;
        continue;
      }
      if (field.max !== undefined && value > field.max) {
        errors[field.name] = `${label} must be at most ${field.max}.`;
        continue;
      }
      const result = await field.validate?.(value, context);
      if (typeof result === "string") errors[field.name] = result;
    }
  }

  if (Object.keys(errors).length) throw new BebopValidationError(errors);
}
