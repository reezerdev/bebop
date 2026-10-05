import type { BebopAdminCollection, BebopAdminField } from "../src/types.js";

export function makeCollection(
  fields: readonly BebopAdminField[],
  overrides: Partial<Omit<BebopAdminCollection, "fields">> = {},
): BebopAdminCollection {
  return {
    slug: "records",
    labels: { singular: "Record", plural: "Records" },
    fields,
    timestamps: false,
    defaultColumns: [],
    listSearchableFields: [],
    writeMode: "direct",
    ...overrides,
  };
}
