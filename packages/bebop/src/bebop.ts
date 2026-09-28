import type { PermissionExpressionInput, RowContext, SessionContext } from "jazz-tools/permissions";

export type FieldOptions = {
  required?: boolean;
};

export type TextField = FieldOptions & { kind: "text" };
export type NumberField = FieldOptions & { kind: "number" };
export type IntegerField = FieldOptions & { kind: "integer" };
export type BooleanField = FieldOptions & { kind: "boolean" };
export type DateField = FieldOptions & { kind: "date" };
export type JsonField = FieldOptions & { kind: "json" };
export type SelectField = FieldOptions & {
  kind: "select";
  options: readonly [string, ...string[]];
};
export type RelationField = FieldOptions & {
  kind: "relation";
  to: string;
};

export type FieldDefinition =
  | TextField
  | NumberField
  | IntegerField
  | BooleanField
  | DateField
  | JsonField
  | SelectField
  | RelationField;

export type Fields = Record<string, FieldDefinition>;

type FieldValue<TField> = TField extends { kind: "text" | "select" | "relation" }
  ? string
  : TField extends { kind: "number" | "integer" }
    ? number
    : TField extends { kind: "boolean" }
      ? boolean
      : TField extends { kind: "date" }
        ? Date
        : unknown;

type StoredFieldName<TName extends string, TField> = TField extends { kind: "relation" }
  ? `${TName}Id`
  : TName;

export type StoredFields<TFields extends Fields> = {
  [TName in keyof TFields as TFields[TName] extends { required: true }
    ? TName extends string ? StoredFieldName<TName, TFields[TName]> : never
    : never]-?: FieldValue<TFields[TName]>;
} & {
  [TName in keyof TFields as TFields[TName] extends { required: true }
    ? never
    : TName extends string ? StoredFieldName<TName, TFields[TName]> : never]?: FieldValue<TFields[TName]>;
};

export type CollectionDocument<TFields extends Fields> = StoredFields<TFields> & {
  id: string;
  $createdAt?: Date;
  $updatedAt?: Date;
};

type AccessCondition<TFields extends Fields> =
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

export type CollectionAccess<TFields extends Fields> = Partial<{
  read: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  create: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  update: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
  delete: BivariantCallback<[context: CollectionAccessContext<TFields>], AccessCondition<TFields>>;
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
  label?: string;
  useAsTitle?: string;
  defaultColumns?: readonly string[];
  listSearchableFields?: readonly string[];
};
export type CollectionDefinition<TFields extends Fields = Fields> = {
  fields: TFields;
  /** Payload-compatible setting; Jazz records timestamps as built-in metadata. */
  timestamps?: boolean;
  admin?: CollectionAdminOptions;
  /** Jazz row-level access predicates. Missing operations are denied. */
  access?: CollectionAccess<TFields>;
  /** Client-side lifecycle callbacks run by the generated Bebop mutation client. */
  hooks?: CollectionHooks<TFields>;
};
export type BetterAuthDefinition = {
  provider: "better-auth";
  /** Path to the Better Auth CLI configuration, relative to the Bebop config. */
  generateConfig?: string;
};
export type BebopConfig = {
  collections: Record<string, CollectionDefinition>;
  auth?: BetterAuthDefinition;
};

export function text<const TOptions extends FieldOptions = {}>(options: TOptions = {} as TOptions): TextField & TOptions {
  return { kind: "text", ...options };
}

export function number<const TOptions extends FieldOptions = {}>(options: TOptions = {} as TOptions): NumberField & TOptions {
  return { kind: "number", ...options };
}

export function integer<const TOptions extends FieldOptions = {}>(options: TOptions = {} as TOptions): IntegerField & TOptions {
  return { kind: "integer", ...options };
}

export function checkbox<const TOptions extends FieldOptions = {}>(options: TOptions = {} as TOptions): BooleanField & TOptions {
  return { kind: "boolean", ...options };
}

export function date<const TOptions extends FieldOptions = {}>(options: TOptions = {} as TOptions): DateField & TOptions {
  return { kind: "date", ...options };
}

export function json<const TOptions extends FieldOptions = {}>(options: TOptions = {} as TOptions): JsonField & TOptions {
  return { kind: "json", ...options };
}

export function select<const T extends readonly [string, ...string[]], const TOptions extends FieldOptions = {}>(
  options: T,
  fieldOptions: TOptions = {} as TOptions,
): SelectField & { options: T } & TOptions {
  return { kind: "select", options, ...fieldOptions };
}

export function relation<const TTo extends string, const TOptions extends FieldOptions = {}>(
  to: TTo,
  options: TOptions = {} as TOptions,
): RelationField & { to: TTo } & TOptions {
  return { kind: "relation", to, ...options };
}

export function collection<const TFields extends Fields>(
  definition: CollectionDefinition<TFields>,
): CollectionDefinition<TFields> {
  return definition;
}

export function defineConfig<const T extends BebopConfig>(config: T): T {
  return config;
}

export function betterAuth(
  options: Omit<BetterAuthDefinition, "provider"> = {},
): BetterAuthDefinition {
  return { provider: "better-auth", ...options };
}
