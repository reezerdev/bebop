export type BebopAdminFieldKind = "text" | "number" | "integer" | "boolean" | "date" | "json" | "select" | "relation";

export type BebopAdminField = {
  name: string;
  storageName: string;
  label: string;
  kind: BebopAdminFieldKind;
  required: boolean;
  admin?: { position?: "main" | "sidebar" };
  options?: readonly string[];
  relationTo?: string;
};

export type BebopAdminCollection = {
  slug: string;
  label: string;
  fields: readonly BebopAdminField[];
  timestamps: boolean;
  useAsTitle?: string;
  defaultColumns: readonly string[];
  listSearchableFields: readonly string[];
};

export type BebopAdminManifest = {
  collections: Readonly<Record<string, BebopAdminCollection>>;
};
