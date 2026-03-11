type BaseSchema = {
  optional?: boolean;
  nullable?: boolean;
};

type StringSchema = BaseSchema & {
  kind: "string";
  minLength?: number;
  maxLength?: number;
  trim?: boolean;
  pattern?: RegExp;
};

type NumberSchema = BaseSchema & {
  kind: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  coerce?: boolean;
};

type BooleanSchema = BaseSchema & {
  kind: "boolean";
  coerce?: boolean;
};

type EnumSchema = BaseSchema & {
  kind: "enum";
  values: readonly string[];
};

type ArraySchema = BaseSchema & {
  kind: "array";
  item: FieldSchema;
  minItems?: number;
  maxItems?: number;
};

type ObjectSchema = BaseSchema & {
  kind: "object";
  fields: Record<string, FieldSchema>;
  allowUnknown?: boolean;
};

type UnionSchema = BaseSchema & {
  kind: "union";
  anyOf: FieldSchema[];
};

type FieldSchema = StringSchema | NumberSchema | BooleanSchema | EnumSchema | ArraySchema | ObjectSchema | UnionSchema;

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pathLabel = (path: string) => (path ? path : "input");

const ensureNoUnknownKeys = (value: Record<string, unknown>, schema: ObjectSchema, path: string) => {
  if (schema.allowUnknown) return;
  const allowed = new Set(Object.keys(schema.fields));
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new InputValidationError(`Unexpected field(s) in ${pathLabel(path)}: ${unknown.join(", ")}.`);
  }
};

const parseStringValue = (raw: unknown, schema: StringSchema, path: string): string => {
  if (typeof raw !== "string") {
    throw new InputValidationError(`${pathLabel(path)} must be a string.`);
  }
  const value = schema.trim ? raw.trim() : raw;

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw new InputValidationError(`${pathLabel(path)} must be at least ${schema.minLength} characters.`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw new InputValidationError(`${pathLabel(path)} must be at most ${schema.maxLength} characters.`);
  }
  if (schema.pattern && !schema.pattern.test(value)) {
    throw new InputValidationError(`${pathLabel(path)} has an invalid format.`);
  }
  return value;
};

const parseNumberValue = (raw: unknown, schema: NumberSchema, path: string): number => {
  const parsed =
    typeof raw === "number"
      ? raw
      : schema.coerce && typeof raw === "string" && raw.trim()
        ? Number(raw.trim())
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new InputValidationError(`${pathLabel(path)} must be a valid number.`);
  }
  if (schema.integer && !Number.isInteger(parsed)) {
    throw new InputValidationError(`${pathLabel(path)} must be an integer.`);
  }
  if (schema.min !== undefined && parsed < schema.min) {
    throw new InputValidationError(`${pathLabel(path)} must be at least ${schema.min}.`);
  }
  if (schema.max !== undefined && parsed > schema.max) {
    throw new InputValidationError(`${pathLabel(path)} must be at most ${schema.max}.`);
  }
  return parsed;
};

const parseBooleanValue = (raw: unknown, schema: BooleanSchema, path: string): boolean => {
  if (typeof raw === "boolean") return raw;
  if (!schema.coerce || typeof raw !== "string") {
    throw new InputValidationError(`${pathLabel(path)} must be a boolean.`);
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new InputValidationError(`${pathLabel(path)} must be a boolean.`);
};

const parseEnumValue = (raw: unknown, schema: EnumSchema, path: string): string => {
  if (typeof raw !== "string") {
    throw new InputValidationError(`${pathLabel(path)} must be a string.`);
  }
  const value = raw.trim();
  if (!schema.values.includes(value)) {
    throw new InputValidationError(`${pathLabel(path)} must be one of: ${schema.values.join(", ")}.`);
  }
  return value;
};

const parseValue = (raw: unknown, schema: FieldSchema, path: string): unknown => {
  if (raw === undefined) {
    if (schema.optional) return undefined;
    throw new InputValidationError(`${pathLabel(path)} is required.`);
  }

  if (raw === null) {
    if (schema.nullable) return null;
    throw new InputValidationError(`${pathLabel(path)} cannot be null.`);
  }

  if (schema.kind === "string") return parseStringValue(raw, schema, path);
  if (schema.kind === "number") return parseNumberValue(raw, schema, path);
  if (schema.kind === "boolean") return parseBooleanValue(raw, schema, path);
  if (schema.kind === "enum") return parseEnumValue(raw, schema, path);

  if (schema.kind === "array") {
    if (!Array.isArray(raw)) {
      throw new InputValidationError(`${pathLabel(path)} must be an array.`);
    }
    if (schema.minItems !== undefined && raw.length < schema.minItems) {
      throw new InputValidationError(`${pathLabel(path)} must contain at least ${schema.minItems} item(s).`);
    }
    if (schema.maxItems !== undefined && raw.length > schema.maxItems) {
      throw new InputValidationError(`${pathLabel(path)} must contain at most ${schema.maxItems} item(s).`);
    }
    return raw.map((item, index) => parseValue(item, schema.item, `${path}[${index}]`));
  }

  if (schema.kind === "object") {
    if (!isPlainObject(raw)) {
      throw new InputValidationError(`${pathLabel(path)} must be an object.`);
    }
    ensureNoUnknownKeys(raw, schema, path);
    const result: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(schema.fields)) {
      const nextPath = path ? `${path}.${key}` : key;
      const parsed = parseValue(raw[key], fieldSchema, nextPath);
      if (parsed !== undefined) result[key] = parsed;
    }
    return result;
  }

  let lastError: InputValidationError | null = null;
  for (const option of schema.anyOf) {
    try {
      return parseValue(raw, option, path);
    } catch (error) {
      if (error instanceof InputValidationError) lastError = error;
    }
  }
  throw lastError ?? new InputValidationError(`${pathLabel(path)} has invalid value.`);
};

const parseAsObject = <T>(raw: unknown, schema: ObjectSchema, path: string): T => parseValue(raw, schema, path) as T;

const searchParamsToObject = (searchParams: URLSearchParams): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key in output) {
      throw new InputValidationError(`Duplicate query parameter: ${key}.`);
    }
    output[key] = value;
  }
  return output;
};

export const parseQueryParams = <T>(request: Request, schema: ObjectSchema): T => {
  const url = new URL(request.url);
  return parseAsObject<T>(searchParamsToObject(url.searchParams), schema, "query");
};

export const parseRouteParams = <T>(params: unknown, schema: ObjectSchema): T => parseAsObject<T>(params, schema, "params");

export const parseJsonBody = async <T>(request: Request, schema: ObjectSchema): Promise<T> => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputValidationError("Body must be valid JSON.");
  }
  return parseAsObject<T>(raw, schema, "body");
};

export const v = {
  string: (schema: Omit<StringSchema, "kind"> = {}): StringSchema => ({ kind: "string", ...schema }),
  number: (schema: Omit<NumberSchema, "kind"> = {}): NumberSchema => ({ kind: "number", ...schema }),
  boolean: (schema: Omit<BooleanSchema, "kind"> = {}): BooleanSchema => ({ kind: "boolean", ...schema }),
  enum: (values: readonly string[], schema: Omit<EnumSchema, "kind" | "values"> = {}): EnumSchema => ({
    kind: "enum",
    values,
    ...schema,
  }),
  array: (item: FieldSchema, schema: Omit<ArraySchema, "kind" | "item"> = {}): ArraySchema => ({
    kind: "array",
    item,
    ...schema,
  }),
  object: (fields: Record<string, FieldSchema>, schema: Omit<ObjectSchema, "kind" | "fields"> = {}): ObjectSchema => ({
    kind: "object",
    fields,
    ...schema,
  }),
  union: (anyOf: FieldSchema[], schema: Omit<UnionSchema, "kind" | "anyOf"> = {}): UnionSchema => ({
    kind: "union",
    anyOf,
    ...schema,
  }),
};
