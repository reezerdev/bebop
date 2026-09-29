import type {
  AllowedToContext,
  PermissionExpressionInput,
  RowContext,
  SessionContext,
} from "jazz-tools/permissions";

export type FieldOptions = {
  name: string;
  label?: string;
  required?: boolean;
  /** Better Auth custom-user-field behavior. Additional fields are read-only on public auth APIs by default. */
  auth?: { input?: boolean };
  admin?: {
    position?: "main" | "sidebar";
    input?: "textarea";
    date?: { pickerAppearance?: "dayOnly" | "dayAndTime" };
  };
};

type FieldValidationContext = {
  operation: "create" | "update";
  data: Readonly<Record<string, unknown>>;
  originalDoc?: Readonly<Record<string, unknown>>;
};
type FieldValidator<TValue> = BivariantCallback<
  [value: TValue | undefined, context: FieldValidationContext],
  true | string | Promise<true | string>
>;

export type TextField = FieldOptions & {
  type: "text";
  minLength?: number;
  maxLength?: number;
  validate?: FieldValidator<string>;
};
export type NumberField = FieldOptions & {
  type: "number";
  integer?: boolean;
  min?: number;
  max?: number;
  validate?: FieldValidator<number>;
};
export type CheckboxField = FieldOptions & { type: "checkbox" };
export type DateField = FieldOptions & { type: "date" };
export type JsonField = FieldOptions & { type: "json" };
export type SelectOption = string | { label: string; value: string };
export type SelectField = FieldOptions & {
  type: "select";
  options: readonly [SelectOption, ...SelectOption[]];
};
export type RelationshipField = FieldOptions & {
  type: "relationship";
  relationTo: string;
};
export type UploadField = FieldOptions & {
  type: "upload";
  relationTo: string;
};
export type JoinField = {
  name: string;
  label?: string;
  type: "join";
  collection: string;
  on: string;
  admin?: {
    defaultColumns?: readonly string[];
    allowCreate?: boolean;
  };
};

export type FieldDefinition =
  | TextField
  | NumberField
  | CheckboxField
  | DateField
  | JsonField
  | SelectField
  | RelationshipField
  | UploadField
  | JoinField;

export type Fields = readonly FieldDefinition[];

type SelectValue<TOption> = TOption extends string ? TOption : TOption extends { value: infer TValue extends string } ? TValue : never;

type FieldValue<TField> = TField extends { type: "select"; options: readonly (infer TOption)[] }
  ? SelectValue<TOption>
  : TField extends { type: "text" | "relationship" | "upload" }
    ? string
    : TField extends { type: "number" }
      ? number
      : TField extends { type: "checkbox" }
        ? boolean
        : TField extends { type: "date" }
          ? Date
          : unknown;

type StoredFieldName<TField> = TField extends { type: "join" }
  ? never
  : TField extends { type: "relationship" | "upload"; name: infer TName extends string }
  ? `${TName}Id`
  : TField extends { name: infer TName extends string }
    ? TName
    : never;

export type StoredFields<TFields extends Fields> = {
  [TField in TFields[number] as TField extends { required: true } ? StoredFieldName<TField> : never]-?: FieldValue<TField>;
} & {
  [TField in TFields[number] as TField extends { required: true } ? never : StoredFieldName<TField>]?: FieldValue<TField>;
};

export type CollectionDocument<TFields extends Fields> = StoredFields<TFields> & {
  id: string;
  $createdAt?: Date;
  $updatedAt?: Date;
};

type AccessCondition<TFields extends Fields> =
  | boolean
  | Partial<Record<keyof StoredFields<TFields> | "id", unknown>>
  | PermissionExpressionInput;

type BivariantCallback<TArguments extends unknown[], TResult> = {
  bivarianceHack(...args: TArguments): TResult;
}["bivarianceHack"];

export type CollectionAccessContext<TFields extends Fields> = {
  row: RowContext<StoredFields<TFields> & { id: string }>;
  session: SessionContext;
  allOf: (conditions: readonly unknown[]) => PermissionExpressionInput;
  anyOf: (conditions: readonly unknown[]) => PermissionExpressionInput;
  exists: (collectionName: string, condition: Record<string, unknown>) => PermissionExpressionInput;
  isCreator: PermissionExpressionInput;
};

export type BebopAdminAccessUser<TFields extends Fields = Fields> = Omit<
  Partial<StoredFields<TFields>>,
  "id" | "name" | "email" | "role" | "emailVerified" | "image" | "createdAt" | "updatedAt" | "banned" | "banReason" | "banExpires"
> & {
  id: string;
  name: string;
  email: string;
  role?: string;
  emailVerified?: boolean;
  image?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
};

export type BebopAdminAccessContext<TFields extends Fields> = {
  req: Request & {
    user: BebopAdminAccessUser<TFields>;
    /** True when Better Auth's Admin plugin recognizes this user as an admin. */
    isAdmin: boolean;
  };
};

export type CollectionAccess<TFields extends Fields> = Partial<{
  read: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  create: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  update: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  delete: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  /** Auth collection only: decides whether the current user may enter the Bebop admin. */
  admin: BivariantCallback<[context: BebopAdminAccessContext<TFields>], boolean | Promise<boolean>>;
}>;

type PermissionRow<TFields extends Fields> = RowContext<StoredFields<TFields> & { id: string }>;
type PermissionWhere<TFields extends Fields> =
  | Partial<Record<keyof StoredFields<TFields> | "id", unknown>>
  | PermissionExpressionInput;
type PermissionPredicate<TFields extends Fields> =
  | PermissionWhere<TFields>
  | ((row: PermissionRow<TFields>) => PermissionWhere<TFields>);

export type CollectionPermissionRule<TFields extends Fields> = {
  where(input: PermissionPredicate<TFields>): unknown;
  always(): unknown;
  never(): unknown;
};

export type CollectionUpdatePermissionRule<TFields extends Fields> = CollectionPermissionRule<TFields> & {
  whereOld(input: PermissionPredicate<TFields>): CollectionUpdatePermissionRule<TFields>;
  whereNew(input: PermissionPredicate<TFields>): CollectionUpdatePermissionRule<TFields>;
};

export type CollectionPermissionReference = {
  exists: {
    where(input: Record<string, unknown> | PermissionExpressionInput): PermissionExpressionInput;
  };
};

export type CollectionPermissionContext<
  TFields extends Fields,
  TOperation extends "read" | "insert" | "update" | "delete" = "read" | "insert" | "update" | "delete",
> = {
  /** Jazz rule builder for this operation on this collection. */
  rule: TOperation extends "update"
    ? CollectionUpdatePermissionRule<TFields>
    : CollectionPermissionRule<TFields>;
  /** Read-only cross-collection exists helpers; these do not grant access to the referenced collection. */
  collections: Readonly<Record<string, CollectionPermissionReference>>;
  session: SessionContext;
  allOf: typeof import("jazz-tools/permissions").allOf;
  anyOf: typeof import("jazz-tools/permissions").anyOf;
  allowedTo: AllowedToContext;
  isCreator: PermissionExpressionInput;
};

export type CollectionPermissions<TFields extends Fields> = Partial<{
  [TOperation in "read" | "insert" | "update" | "delete"]: BivariantCallback<
    [context: CollectionPermissionContext<TFields, TOperation>],
    void
  >;
}>;

export type CollectionChangeContext<TFields extends Fields> = {
  operation: "create" | "update";
  id?: string;
  data: Partial<StoredFields<TFields>>;
  originalDoc?: Readonly<CollectionDocument<TFields>>;
};

export type CollectionHooks<TFields extends Fields> = {
  beforeChange?: BivariantCallback<
    [context: CollectionChangeContext<TFields>],
    void | Partial<StoredFields<TFields>> | Promise<void | Partial<StoredFields<TFields>>>
  >;
  afterChange?: BivariantCallback<[context: {
    operation: "create" | "update";
    doc: Readonly<CollectionDocument<TFields>>;
    originalDoc?: Readonly<CollectionDocument<TFields>>;
  }], void | Promise<void>>;
  beforeDelete?: BivariantCallback<[context: {
    id: string;
    doc?: Readonly<CollectionDocument<TFields>>;
  }], void | Promise<void>>;
  afterDelete?: BivariantCallback<[context: {
    id: string;
    doc?: Readonly<CollectionDocument<TFields>>;
  }], void | Promise<void>>;
};

export type CollectionAdminOptions = {
  /** @deprecated Use collection labels.plural instead. */
  label?: string;
  useAsTitle?: string;
  defaultColumns?: readonly string[];
  listSearchableFields?: readonly string[];
};
export type CollectionDefinition<TFields extends Fields = Fields> = {
  slug: string;
  /** Use Better Auth's built-in user model for this collection. Only one collection may set auth: true. */
  auth?: true;
  /** Payload-style collection names. Unspecified names are derived from the slug. */
  labels?: { singular?: string; plural?: string };
  fields: TFields;
  /** Enable file storage for this collection. */
  upload?: true | { mimeTypes?: readonly string[] };
  /** Payload-compatible setting; Jazz records timestamps as built-in metadata. */
  timestamps?: boolean;
  admin?: CollectionAdminOptions;
  /** @deprecated Use permissions for Jazz-style operation rules. */
  access?: "authenticated" | "public" | CollectionAccess<TFields>;
  /** Jazz-style per-operation rules. Omitted operations are denied. */
  permissions?: CollectionPermissions<TFields>;
  /** Direct writes are local-first. Command writes go through the host's trusted Bebop handler. */
  writeMode?: "direct" | "command";
  /** Client-side lifecycle callbacks run by the generated Bebop mutation client. */
  hooks?: CollectionHooks<TFields>;
};
export type BebopConfig = {
  collections: readonly CollectionDefinition[];
  upload?: { limits?: { fileSize?: number } };
};

export function collection<const TSlug extends string, const TFields extends Fields>(
  definition: CollectionDefinition<TFields> & { slug: TSlug; auth: true },
): CollectionDefinition<TFields> & { slug: TSlug; auth: true };
export function collection<const TSlug extends string, const TFields extends Fields>(
  definition: CollectionDefinition<TFields> & { slug: TSlug; upload: true | { mimeTypes?: readonly string[] } },
): CollectionDefinition<TFields> & { slug: TSlug; upload: true | { mimeTypes?: readonly string[] } };
export function collection<const TSlug extends string, const TFields extends Fields>(
  definition: CollectionDefinition<TFields> & { slug: TSlug },
): CollectionDefinition<TFields> & { slug: TSlug };
export function collection<const TSlug extends string, const TFields extends Fields>(
  definition: CollectionDefinition<TFields> & { slug: TSlug },
): CollectionDefinition<TFields> & { slug: TSlug } {
  return definition;
}

export function defineConfig<const T extends BebopConfig>(config: T): T {
  return config;
}
