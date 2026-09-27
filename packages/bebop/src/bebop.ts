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

export function text(options: FieldOptions = {}): TextField {
  return { kind: "text", ...options };
}

export function number(options: FieldOptions = {}): NumberField {
  return { kind: "number", ...options };
}

export function integer(options: FieldOptions = {}): IntegerField {
  return { kind: "integer", ...options };
}

export function checkbox(options: FieldOptions = {}): BooleanField {
  return { kind: "boolean", ...options };
}

export function date(options: FieldOptions = {}): DateField {
  return { kind: "date", ...options };
}

export function json(options: FieldOptions = {}): JsonField {
  return { kind: "json", ...options };
}

export function select<const T extends readonly [string, ...string[]]>(
  options: T,
  fieldOptions: FieldOptions = {},
): SelectField & { options: T } {
  return { kind: "select", options, ...fieldOptions };
}

export function relation(to: string, options: FieldOptions = {}): RelationField {
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
