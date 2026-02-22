import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import type { JsonSchema } from "@fenced/shared";

// ============================================================================
// Binder Types
// ============================================================================

type BaseBinder = {
  error: boolean;
  helperText: string | undefined;
  _setError: (message: string | undefined) => void;
};

type FormSubmitHandler = (value: unknown) => void;

export type StringBinder = BaseBinder & {
  _kind: "string";
  value: string;
  onChange: (eventOrValue: ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => void;
};

export type NumberBinder = BaseBinder & {
  _kind: "number";
  value: string; // String for controlled input
  onChange: (eventOrValue: ChangeEvent<HTMLInputElement> | string | number) => void;
  _numericValue: number | undefined; // Parsed numeric value
};

export type BooleanBinder = BaseBinder & {
  _kind: "boolean";
  checked: boolean;
  onChange: (eventOrValue: ChangeEvent<HTMLInputElement> | boolean) => void;
};

export type EnumBinder = BaseBinder & {
  _kind: "enum";
  value: string;
  options: (string | number | boolean | null)[];
  onChange: (eventOrValue: ChangeEvent<HTMLInputElement> | { target: { value: string } } | string) => void;
};

export type DateBinder = BaseBinder & {
  _kind: "date";
  value: string; // ISO8601
  onChange: (eventOrValue: ChangeEvent<HTMLInputElement> | string) => void;
};

// Forward declaration for recursive types
export type OutputBinder =
  | StringBinder
  | NumberBinder
  | BooleanBinder
  | EnumBinder
  | DateBinder
  | ArrayBinder
  | ObjectBinder;

export type ArrayBinder = BaseBinder & {
  _kind: "array";
  items: OutputBinder[];
  push: (initialValue?: unknown) => void;
  remove: (index: number) => void;
  value: unknown[];
};

export type ObjectBinder = BaseBinder & {
  _kind: "object";
  value: Record<string, unknown>;
  // Form-level props for spreading onto form/button elements
  onSubmit: (e: FormEvent) => void;
  onClick: (e: MouseEvent) => void;
  disabled: boolean;
  [key: string]: unknown; // Allow dynamic field access
};

// ============================================================================
// Binder Factory
// ============================================================================

type Notify = () => void;

type BuilderContext = {
  notify: Notify;
  onSubmit?: FormSubmitHandler;
  rootBinder?: ObjectBinder;
  rootSchema?: JsonSchema;
};

export function buildOutputBinder(
  schema: JsonSchema,
  notify: Notify,
  onSubmit?: FormSubmitHandler,
  initialValue?: unknown,
): OutputBinder {
  const context: BuilderContext = { notify, onSubmit, rootSchema: schema };
  const binder = buildBinderInternal(schema, context, initialValue);
  if (binder._kind === "object") {
    context.rootBinder = binder;
  }
  return binder;
}

function buildBinderInternal(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): OutputBinder {
  // Handle enum first (has enum array)
  if (schema.enum) {
    return createEnumBinder(schema, context, initialValue);
  }

  // Handle by type
  switch (schema.type) {
    case "string":
      // Check for date format
      if (schema.format === "date-time" || schema.format === "date") {
        return createDateBinder(schema, context, initialValue);
      }
      return createStringBinder(schema, context, initialValue);
    case "number":
    case "integer":
      return createNumberBinder(schema, context, initialValue);
    case "boolean":
      return createBooleanBinder(schema, context, initialValue);
    case "array":
      return createArrayBinder(schema, context, initialValue);
    case "object":
      return createObjectBinder(schema, context, initialValue);
    default:
      // Fallback to string binder for unknown types
      return createStringBinder(schema, context, initialValue);
  }
}

// ============================================================================
// Smart onChange Helper
// ============================================================================

function extractStringValue(
  eventOrValue: ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: string } } | string,
): string {
  if (typeof eventOrValue === "string") {
    return eventOrValue;
  }
  if (eventOrValue && typeof eventOrValue === "object" && "target" in eventOrValue) {
    const target = eventOrValue.target as { value?: string };
    return String(target.value ?? "");
  }
  return String(eventOrValue ?? "");
}

function extractBooleanValue(
  eventOrValue: ChangeEvent<HTMLInputElement> | boolean,
): boolean {
  if (typeof eventOrValue === "boolean") {
    return eventOrValue;
  }
  if (eventOrValue && typeof eventOrValue === "object" && "target" in eventOrValue) {
    const target = eventOrValue.target as { checked?: boolean };
    return Boolean(target.checked);
  }
  return Boolean(eventOrValue);
}

function extractNumberValue(
  eventOrValue: ChangeEvent<HTMLInputElement> | string | number,
): { str: string; num: number | undefined } {
  if (typeof eventOrValue === "number") {
    return { str: String(eventOrValue), num: eventOrValue };
  }
  if (typeof eventOrValue === "string") {
    const num = parseFloat(eventOrValue);
    return { str: eventOrValue, num: Number.isFinite(num) ? num : undefined };
  }
  if (eventOrValue && typeof eventOrValue === "object" && "target" in eventOrValue) {
    const target = eventOrValue.target as { value?: string };
    const str = target.value ?? "";
    const num = parseFloat(str);
    return { str, num: Number.isFinite(num) ? num : undefined };
  }
  return { str: "", num: undefined };
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateString(value: string, schema: JsonSchema): string | undefined {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    return `Minimum ${schema.minLength} characters required`;
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    return `Maximum ${schema.maxLength} characters allowed`;
  }
  if (schema.pattern !== undefined) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      return "Invalid format";
    }
  }
  return undefined;
}

function validateNumber(value: number | undefined, schema: JsonSchema): string | undefined {
  if (value === undefined) {
    return undefined; // Let required validation handle this
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    return `Minimum value is ${schema.minimum}`;
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    return `Maximum value is ${schema.maximum}`;
  }
  return undefined;
}

// ============================================================================
// Binder Creators
// ============================================================================

function createStringBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): StringBinder {
  const defaultVal = typeof initialValue === "string"
    ? initialValue
    : typeof schema.default === "string"
      ? schema.default
      : "";

  const binder: StringBinder = {
    _kind: "string",
    value: defaultVal,
    error: false,
    helperText: undefined,
    onChange(eventOrValue) {
      binder.value = extractStringValue(eventOrValue);
      // Live validation
      const validationError = validateString(binder.value, schema);
      binder.error = validationError !== undefined;
      binder.helperText = validationError;
      context.notify();
    },
    _setError(message) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  return binder;
}

function createNumberBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): NumberBinder {
  const defaultNum = typeof initialValue === "number"
    ? initialValue
    : typeof schema.default === "number"
      ? schema.default
      : undefined;

  const binder: NumberBinder = {
    _kind: "number",
    value: defaultNum !== undefined ? String(defaultNum) : "",
    _numericValue: defaultNum,
    error: false,
    helperText: undefined,
    onChange(eventOrValue) {
      const { str, num } = extractNumberValue(eventOrValue);
      binder.value = str;
      binder._numericValue = num;
      // Live validation
      const validationError = validateNumber(num, schema);
      binder.error = validationError !== undefined;
      binder.helperText = validationError;
      context.notify();
    },
    _setError(message) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  return binder;
}

function createBooleanBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): BooleanBinder {
  const defaultVal = typeof initialValue === "boolean"
    ? initialValue
    : typeof schema.default === "boolean"
      ? schema.default
      : false;

  const binder: BooleanBinder = {
    _kind: "boolean",
    checked: defaultVal,
    error: false,
    helperText: undefined,
    onChange(eventOrValue) {
      binder.checked = extractBooleanValue(eventOrValue);
      binder.error = false;
      binder.helperText = undefined;
      context.notify();
    },
    _setError(message) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  return binder;
}

function createEnumBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): EnumBinder {
  const options = schema.enum ?? [];
  const defaultVal = typeof initialValue === "string"
    ? initialValue
    : typeof schema.default === "string"
      ? schema.default
      : typeof options[0] === "string"
        ? options[0]
        : "";

  const binder: EnumBinder = {
    _kind: "enum",
    value: defaultVal,
    options,
    error: false,
    helperText: undefined,
    onChange(eventOrValue) {
      binder.value = extractStringValue(eventOrValue);
      binder.error = false;
      binder.helperText = undefined;
      context.notify();
    },
    _setError(message) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  return binder;
}

function createDateBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): DateBinder {
  const defaultVal = typeof initialValue === "string"
    ? initialValue
    : typeof schema.default === "string"
      ? schema.default
      : "";

  const binder: DateBinder = {
    _kind: "date",
    value: defaultVal,
    error: false,
    helperText: undefined,
    onChange(eventOrValue) {
      binder.value = extractStringValue(eventOrValue);
      binder.error = false;
      binder.helperText = undefined;
      context.notify();
    },
    _setError(message) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  return binder;
}

function createArrayBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): ArrayBinder {
  const itemSchema = schema.items ?? { type: "string" };
  const defaultItems = Array.isArray(initialValue)
    ? initialValue
    : Array.isArray(schema.default)
      ? schema.default
      : [];

  const binder: ArrayBinder = {
    _kind: "array",
    items: defaultItems.map((item) => buildBinderInternal(itemSchema, context, item)),
    error: false,
    helperText: undefined,
    get value() {
      return binder.items.map((item) => getBinderValue(item));
    },
    push(initialValue?: unknown) {
      binder.items.push(buildBinderInternal(itemSchema, context, initialValue));
      context.notify();
    },
    remove(index: number) {
      binder.items.splice(index, 1);
      context.notify();
    },
    _setError(message) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  return binder;
}

function createObjectBinder(
  schema: JsonSchema,
  context: BuilderContext,
  initialValue?: unknown,
): ObjectBinder {
  const properties = schema.properties ?? {};
  const requiredFields = new Set(schema.required ?? []);
  const baseValue = isRecord(initialValue)
    ? initialValue
    : isRecord(schema.default)
      ? schema.default
      : {};

  // Helper to check if any child binder has errors
  const hasAnyError = (): boolean => {
    for (const key of Object.keys(properties)) {
      if (key in binder && !isReservedKey(key)) {
        const child = binder[key] as OutputBinder;
        if (child.error) return true;
      }
    }
    return false;
  };

  // Helper to validate required fields
  const validateRequired = (): boolean => {
    let hasErrors = false;
    Array.from(requiredFields).forEach((key) => {
      if (key in binder && !isReservedKey(key)) {
        const child = binder[key] as OutputBinder;
        const value = getBinderValue(child);
        const isEmpty = value === undefined || value === null || value === "";
        if (isEmpty) {
          child._setError("This field is required");
          hasErrors = true;
        }
      }
    });
    return !hasErrors;
  };

  // Form submission handler
  const handleSubmit = () => {
    // Validate required fields
    if (!validateRequired()) {
      return; // Don't submit if required fields are missing
    }
    // Check for any validation errors
    if (hasAnyError()) {
      return; // Don't submit if there are errors
    }
    // Call the submit handler
    context.onSubmit?.(binder.value);
  };

  const binder: ObjectBinder = {
    _kind: "object",
    error: false,
    helperText: undefined,
    get value() {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(properties)) {
        if (key in binder && !isReservedKey(key)) {
          result[key] = getBinderValue(binder[key] as OutputBinder);
        }
      }
      return result;
    },
    // Form-level props for spreading onto form/button elements
    onSubmit(e: FormEvent) {
      e.preventDefault();
      handleSubmit();
    },
    onClick(e: MouseEvent) {
      e.preventDefault();
      handleSubmit();
    },
    get disabled() {
      return hasAnyError();
    },
    _setError(message: string | undefined) {
      binder.error = message !== undefined;
      binder.helperText = message;
      context.notify();
    },
  };

  // Create child binders for each property
  for (const [key, fieldSchema] of Object.entries(properties)) {
    binder[key] = buildBinderInternal(fieldSchema, context, baseValue[key]);
  }

  return binder;
}

// ============================================================================
// Value Extraction
// ============================================================================

export function getBinderValue(binder: OutputBinder): unknown {
  if (!binder) return undefined;

  switch (binder._kind) {
    case "string":
      return binder.value;
    case "number":
      return binder._numericValue;
    case "boolean":
      return binder.checked;
    case "enum":
      return binder.value;
    case "date":
      return binder.value;
    case "array":
      return binder.value;
    case "object":
      return binder.value;
    default:
      return undefined;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReservedKey(key: string): boolean {
  return (
    key === "value" ||
    key === "error" ||
    key === "helperText" ||
    key === "_kind" ||
    key === "_setError" ||
    key === "onSubmit" ||
    key === "onClick" ||
    key === "disabled"
  );
}
