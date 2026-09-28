export type BebopAdminFieldKind = "text" | "number" | "integer" | "boolean" | "date" | "json" | "select" | "relation";

export type BebopAdminField = {
  name: string;
  storageName: string;
  label: string;
  kind: BebopAdminFieldKind;
  required: boolean;
  admin?: { position?: "main" | "sidebar" };
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  relationTo?: string;
};

export type BebopAdminCollection = {
  slug: string;
  labels: { singular: string; plural: string };
  fields: readonly BebopAdminField[];
  timestamps: boolean;
  useAsTitle?: string;
  defaultColumns: readonly string[];
  listSearchableFields: readonly string[];
};

export type BebopAdminManifest = {
  collections: Readonly<Record<string, BebopAdminCollection>>;
};
