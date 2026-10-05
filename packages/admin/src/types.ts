export type BebopAdminStoredFieldKind = "text" | "number" | "integer" | "boolean" | "date" | "json" | "select" | "relation" | "upload";
export type BebopAdminFieldKind = BebopAdminStoredFieldKind | "join";

type BebopAdminFieldBase = {
  name: string;
  label: string;
};

type BebopAdminFieldOptions = {
  admin?: {
    position?: "main" | "sidebar";
    hidden?: boolean;
    readOnly?: boolean;
    input?: "textarea" | "select";
    date?: { pickerAppearance?: "dayOnly" | "dayAndTime" };
    defaultColumns?: readonly string[];
    allowCreate?: boolean;
  };
};

export type BebopAdminStoredField = BebopAdminFieldBase & BebopAdminFieldOptions & {
  kind: BebopAdminStoredFieldKind;
  storageName: string;
  required: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  relationTo?: string;
  generated?: boolean;
};

export type BebopAdminJoinField = BebopAdminFieldBase & BebopAdminFieldOptions & {
  kind: "join";
  required: false;
  collection: string;
  on: string;
};

export type BebopAdminField = BebopAdminStoredField | BebopAdminJoinField;

export type BebopAdminCollection = {
  slug: string;
  /** The collection uses Better Auth's protected user APIs. */
  auth?: true;
  labels: { singular: string; plural: string };
  fields: readonly BebopAdminField[];
  timestamps: boolean;
  useAsTitle?: string | readonly string[];
  defaultColumns: readonly string[];
  listSearchableFields: readonly string[];
  writeMode: "direct" | "command";
  upload?: { mimeTypes: readonly string[]; maxFileSize: number };
};

export type BebopAdminManifest = {
  collections: Readonly<Record<string, BebopAdminCollection>>;
};
