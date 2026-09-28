import type { PermissionExpressionInput, RowContext, SessionContext } from "jazz-tools/permissions";

export type FieldOptions = {
  name: string;
  label?: string;
  required?: boolean;
  admin?: { position?: "main" | "sidebar" };
};

export type TextField = FieldOptions & { type: "text" };
export type NumberField = FieldOptions & { type: "number"; integer?: boolean };
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

export type FieldDefinition =
  | TextField
  | NumberField
  | CheckboxField
  | DateField
  | JsonField
  | SelectField
  | RelationshipField;

export type Fields = readonly FieldDefinition[];

type SelectValue<TOption> = TOption extends string ? TOption : TOption extends { value: infer TValue extends string } ? TValue : never;

type FieldValue<TField> = TField extends { type: "select"; options: readonly (infer TOption)[] }
  ? SelectValue<TOption>
  : TField extends { type: "text" | "relationship" }
    ? string
    : TField extends { type: "number" }
      ? number
      : TField extends { type: "checkbox" }
        ? boolean
        : TField extends { type: "date" }
          ? Date
          : unknown;

type StoredFieldName<TField> = TField extends { type: "relationship"; name: infer TName extends string }
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
  /** @deprecated Use collection labels.plural instead. */
  label?: string;
  useAsTitle?: string;
  defaultColumns?: readonly string[];
  listSearchableFields?: readonly string[];
};
export type CollectionDefinition<TFields extends Fields = Fields> = {
  slug: string;
  /** Payload-style collection names. Unspecified names are derived from the slug. */
  labels?: { singular?: string; plural?: string };
  fields: TFields;
  /** Payload-compatible setting; Jazz records timestamps as built-in metadata. */
  timestamps?: boolean;
  admin?: CollectionAdminOptions;
  /** Jazz row-level access predicates. Use "public" to grant all operations; omitted operations are denied. */
  access?: "public" | CollectionAccess<TFields>;
  /** Client-side lifecycle callbacks run by the generated Bebop mutation client. */
  hooks?: CollectionHooks<TFields>;
};
export type BetterAuthDefinition = {
  provider: "better-auth";
  /** Path to the Better Auth CLI configuration, relative to the Bebop config. */
  generateConfig?: string;
};
export type BebopConfig = {
  collections: readonly CollectionDefinition[];
  auth?: BetterAuthDefinition;
};

export function collection<const TSlug extends string, const TFields extends Fields>(
  definition: CollectionDefinition<TFields> & { slug: TSlug },
): CollectionDefinition<TFields> & { slug: TSlug } {
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
