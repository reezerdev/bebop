import type {
  AllowedToContext,
  PermissionExpressionInput,
  RowContext,
  SessionContext,
} from "jazz-tools/permissions";

export type BebopJSONValue =
  | string
  | number
  | boolean
  | null
  | readonly BebopJSONValue[]
  | { readonly [key: string]: BebopJSONValue };

export type BebopJSONDefault = Exclude<BebopJSONValue, null>;

export type FieldOptions<TDefault = never> = {
  name: string;
  label?: string;
  required?: boolean;
  /** Value used when a create operation omits this field. */
  default?: TDefault;
  /** Better Auth custom-user-field behavior. Additional fields are read-only on public auth APIs by default. */
  auth?: { input?: boolean };
  admin?: {
    position?: "main" | "sidebar";
    hidden?: boolean;
    readOnly?: boolean;
    input?: "textarea" | "select";
    options?: readonly [SelectOption, ...SelectOption[]];
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

export type TextField = FieldOptions<string> & {
  type: "text";
  minLength?: number;
  maxLength?: number;
  validate?: FieldValidator<string>;
};
export type NumberField = FieldOptions<number> & {
  type: "number";
  integer?: boolean;
  min?: number;
  max?: number;
  validate?: FieldValidator<number>;
};
export type CheckboxField = FieldOptions<boolean> & { type: "checkbox" };
export type DateField = FieldOptions<Date | number> & { type: "date" };
export type JsonField = FieldOptions<BebopJSONDefault> & { type: "json" };
export type SelectOption = string | { label: string; value: string };
export type SelectField = FieldOptions<string> & {
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
  /** Authenticated Jazz subject associated with the current replica, when present. */
  userId?: string;
  /** Bebop mutation and query methods scoped to the local-first transaction running this hook. */
  client?: BebopHookClient;
};

export type BebopHookDocument = Readonly<Record<string, unknown>> & { id: string };
export type BebopHookQueryOptions = {
  where?: Readonly<Record<string, unknown>>;
  orderBy?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
  includeTimestamps?: boolean;
};
export type BebopHookCollectionClient = {
  find(options?: BebopHookQueryOptions): Promise<BebopHookDocument[]>;
  findById(id: string): Promise<BebopHookDocument | null>;
  create(data: Readonly<Record<string, unknown>>): Promise<BebopHookDocument>;
  update(id: string, data: Readonly<Record<string, unknown>>): Promise<BebopHookDocument>;
  delete(id: string): Promise<void>;
};
export type BebopHookClient = Readonly<Record<string, BebopHookCollectionClient>>;

export type CollectionHooks<TFields extends Fields> = {
  beforeChange?: BivariantCallback<
    [context: CollectionChangeContext<TFields>],
    void | Partial<StoredFields<TFields>> | Promise<void | Partial<StoredFields<TFields>>>
  >;
  afterChange?: BivariantCallback<[context: {
    operation: "create" | "update";
    doc: Readonly<CollectionDocument<TFields>>;
    originalDoc?: Readonly<CollectionDocument<TFields>>;
    userId?: string;
    client?: BebopHookClient;
  }], void | Promise<void>>;
  beforeDelete?: BivariantCallback<[context: {
    id: string;
    doc?: Readonly<CollectionDocument<TFields>>;
    userId?: string;
    client?: BebopHookClient;
  }], void | Promise<void>>;
  afterDelete?: BivariantCallback<[context: {
    id: string;
    doc?: Readonly<CollectionDocument<TFields>>;
    userId?: string;
    client?: BebopHookClient;
  }], void | Promise<void>>;
};

export type CollectionAdminOptions = {
  /** @deprecated Use collection labels.plural instead. */
  label?: string;
  /** One field, or an ordered list of fields joined with a middle dot for document titles. */
  useAsTitle?: string | readonly string[];
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
  /** Opt-in Jazz index configuration. Field names refer to configured fields; relationship names map to their stored `...Id` columns. */
  indexes?: {
    /** Keep indexes only for these columns. Omitted columns can still be queried, but may require table scans. */
    only?: readonly string[];
    /** Add composite indexes for common multi-column filters and sorts. */
    composite?: readonly (readonly string[])[];
  };
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
  /** Lifecycle callbacks run by the generated mutation client or command handler, depending on writeMode. */
  hooks?: CollectionHooks<TFields>;
};
export type BebopConfig = {
  collections: readonly CollectionDefinition[];
  upload?: { limits?: { fileSize?: number } };
  /** Opt-in lifecycle hook logging. Disabled by default. */
  logging?: { hooks?: boolean };
};

export function defineConfig<const T extends BebopConfig>(config: T): T {
  return config;
}
