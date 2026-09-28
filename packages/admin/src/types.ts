export type BebopAdminFieldKind = "text" | "number" | "integer" | "boolean" | "date" | "json" | "select" | "relation";

export type BebopAdminField = {
  name: string;
  storageName: string;
  label: string;
  kind: BebopAdminFieldKind;
  required: boolean;
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
  sidebarFields?: readonly string[];
};

export type BebopAdminManifest = {
  collections: Readonly<Record<string, BebopAdminCollection>>;
};
