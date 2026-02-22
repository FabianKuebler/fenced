import { describe, expect, test, mock } from "bun:test";
import { buildOutputBinder, getBinderValue, type OutputBinder } from "../binder";
import type { JsonSchema } from "@fenced/shared";

// Helper to create a mock notify function
const createNotify = () => mock(() => {});

// ============================================================================
// String Binder Tests
// ============================================================================

describe("StringBinder", () => {
  const stringSchema: JsonSchema = { type: "string" };

  test("initializes with empty string by default", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify);

    expect(binder._kind).toBe("string");
    expect(binder.value).toBe("");
    expect(binder.error).toBe(false);
    expect(binder.helperText).toBeUndefined();
  });

  test("initializes with default value from schema", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "string", default: "hello" };
    const binder = buildOutputBinder(schema, notify);

    expect(binder.value).toBe("hello");
  });

  test("initializes with provided initial value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify, undefined, "initial");

    expect((binder as { value: string }).value).toBe("initial");
  });

  test("onChange with string value updates value and notifies", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify) as { value: string; onChange: (v: string) => void };

    binder.onChange("new value");

    expect(binder.value).toBe("new value");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test("onChange with event extracts target.value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify) as { value: string; onChange: (v: unknown) => void };

    const mockEvent = { target: { value: "from event" } };
    binder.onChange(mockEvent);

    expect(binder.value).toBe("from event");
  });

  test("onChange clears error state", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify) as OutputBinder;

    // Set an error first
    binder._setError("Some error");
    expect(binder.error).toBe(true);
    expect(binder.helperText).toBe("Some error");

    // onChange should clear it
    (binder as { onChange: (v: string) => void }).onChange("new");
    expect(binder.error).toBe(false);
    expect(binder.helperText).toBeUndefined();
  });

  test("_setError sets error state", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify);

    binder._setError("Required field");

    expect(binder.error).toBe(true);
    expect(binder.helperText).toBe("Required field");
  });

  test("_setError with undefined clears error", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(stringSchema, notify);

    binder._setError("Error");
    binder._setError(undefined);

    expect(binder.error).toBe(false);
    expect(binder.helperText).toBeUndefined();
  });
});

// ============================================================================
// Number Binder Tests
// ============================================================================

describe("NumberBinder", () => {
  const numberSchema: JsonSchema = { type: "number" };

  test("initializes with empty string by default", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(numberSchema, notify);

    expect(binder._kind).toBe("number");
    expect(binder.value).toBe("");
    expect((binder as { _numericValue: number | undefined })._numericValue).toBeUndefined();
  });

  test("initializes with default value from schema", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "number", default: 42 };
    const binder = buildOutputBinder(schema, notify);

    expect(binder.value).toBe("42");
    expect((binder as { _numericValue: number })._numericValue).toBe(42);
  });

  test("onChange with number updates both string and numeric value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(numberSchema, notify) as {
      value: string;
      _numericValue: number | undefined;
      onChange: (v: number) => void;
    };

    binder.onChange(123);

    expect(binder.value).toBe("123");
    expect(binder._numericValue).toBe(123);
  });

  test("onChange with string parses to number", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(numberSchema, notify) as {
      value: string;
      _numericValue: number | undefined;
      onChange: (v: string) => void;
    };

    binder.onChange("456.78");

    expect(binder.value).toBe("456.78");
    expect(binder._numericValue).toBe(456.78);
  });

  test("onChange with invalid string keeps string but numericValue is undefined", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(numberSchema, notify) as {
      value: string;
      _numericValue: number | undefined;
      onChange: (v: string) => void;
    };

    binder.onChange("not a number");

    expect(binder.value).toBe("not a number");
    expect(binder._numericValue).toBeUndefined();
  });

  test("onChange with event extracts value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(numberSchema, notify) as {
      value: string;
      _numericValue: number | undefined;
      onChange: (v: unknown) => void;
    };

    binder.onChange({ target: { value: "99" } });

    expect(binder.value).toBe("99");
    expect(binder._numericValue).toBe(99);
  });

  test("getBinderValue returns numeric value", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "number", default: 42 };
    const binder = buildOutputBinder(schema, notify);

    expect(getBinderValue(binder)).toBe(42);
  });

  test("integer type creates number binder", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "integer", default: 10 };
    const binder = buildOutputBinder(schema, notify);

    expect(binder._kind).toBe("number");
    expect((binder as { _numericValue: number })._numericValue).toBe(10);
  });
});

// ============================================================================
// Boolean Binder Tests
// ============================================================================

describe("BooleanBinder", () => {
  const booleanSchema: JsonSchema = { type: "boolean" };

  test("initializes with false by default", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(booleanSchema, notify);

    expect(binder._kind).toBe("boolean");
    expect((binder as { checked: boolean }).checked).toBe(false);
  });

  test("initializes with default value from schema", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "boolean", default: true };
    const binder = buildOutputBinder(schema, notify);

    expect((binder as { checked: boolean }).checked).toBe(true);
  });

  test("onChange with boolean updates checked", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(booleanSchema, notify) as {
      checked: boolean;
      onChange: (v: boolean) => void;
    };

    binder.onChange(true);

    expect(binder.checked).toBe(true);
    expect(notify).toHaveBeenCalled();
  });

  test("onChange with event extracts target.checked", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(booleanSchema, notify) as {
      checked: boolean;
      onChange: (v: unknown) => void;
    };

    binder.onChange({ target: { checked: true } });

    expect(binder.checked).toBe(true);
  });

  test("getBinderValue returns checked state", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "boolean", default: true };
    const binder = buildOutputBinder(schema, notify);

    expect(getBinderValue(binder)).toBe(true);
  });
});

// ============================================================================
// Enum Binder Tests
// ============================================================================

describe("EnumBinder", () => {
  const enumSchema: JsonSchema = {
    enum: ["eu", "us", "asia"],
  };

  test("initializes with first value by default", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(enumSchema, notify);

    expect(binder._kind).toBe("enum");
    expect(binder.value).toBe("eu");
  });

  test("initializes with default value from schema", () => {
    const notify = createNotify();
    const schema: JsonSchema = {
      enum: ["eu", "us", "asia"],
      default: "us",
    };
    const binder = buildOutputBinder(schema, notify);

    expect(binder.value).toBe("us");
  });

  test("onChange with string updates value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(enumSchema, notify) as {
      value: string;
      onChange: (v: string) => void;
    };

    binder.onChange("asia");

    expect(binder.value).toBe("asia");
  });

  test("onChange with event extracts target.value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(enumSchema, notify) as {
      value: string;
      onChange: (v: unknown) => void;
    };

    binder.onChange({ target: { value: "us" } });

    expect(binder.value).toBe("us");
  });

  test("exposes options array", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(enumSchema, notify) as {
      options: (string | number | boolean | null)[];
    };

    expect(binder.options).toEqual(["eu", "us", "asia"]);
  });
});

// ============================================================================
// Date Binder Tests
// ============================================================================

describe("DateBinder", () => {
  const dateSchema: JsonSchema = { type: "string", format: "date-time" };

  test("initializes with empty string by default", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(dateSchema, notify);

    expect(binder._kind).toBe("date");
    expect(binder.value).toBe("");
  });

  test("initializes with default value from schema", () => {
    const notify = createNotify();
    const schema: JsonSchema = { type: "string", format: "date", default: "2024-01-15" };
    const binder = buildOutputBinder(schema, notify);

    expect(binder.value).toBe("2024-01-15");
  });

  test("onChange updates value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(dateSchema, notify) as {
      value: string;
      onChange: (v: string) => void;
    };

    binder.onChange("2024-12-25T10:30:00Z");

    expect(binder.value).toBe("2024-12-25T10:30:00Z");
  });
});

// ============================================================================
// Array Binder Tests
// ============================================================================

describe("ArrayBinder", () => {
  const arraySchema: JsonSchema = {
    type: "array",
    items: { type: "string" },
  };

  test("initializes with empty array by default", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(arraySchema, notify);

    expect(binder._kind).toBe("array");
    expect((binder as { items: unknown[] }).items).toHaveLength(0);
    expect(binder.value).toEqual([]);
  });

  test("initializes with default value from schema", () => {
    const notify = createNotify();
    const schema: JsonSchema = {
      type: "array",
      items: { type: "string" },
      default: ["a", "b"],
    };
    const binder = buildOutputBinder(schema, notify);

    expect((binder as { items: unknown[] }).items).toHaveLength(2);
    expect(binder.value).toEqual(["a", "b"]);
  });

  test("push adds new item", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(arraySchema, notify) as {
      items: OutputBinder[];
      push: (init?: unknown) => void;
      value: unknown[];
    };

    binder.push();

    expect(binder.items).toHaveLength(1);
    expect(binder.items[0]._kind).toBe("string");
    expect(notify).toHaveBeenCalled();
  });

  test("push with initial value sets item value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(arraySchema, notify) as {
      items: OutputBinder[];
      push: (init?: unknown) => void;
      value: unknown[];
    };

    binder.push("hello");

    expect(binder.items[0].value).toBe("hello");
  });

  test("remove removes item at index", () => {
    const notify = createNotify();
    const schema: JsonSchema = {
      type: "array",
      items: { type: "string" },
      default: ["a", "b", "c"],
    };
    const binder = buildOutputBinder(schema, notify) as {
      items: OutputBinder[];
      remove: (index: number) => void;
      value: unknown[];
    };

    binder.remove(1);

    expect(binder.items).toHaveLength(2);
    expect(binder.value).toEqual(["a", "c"]);
  });

  test("value returns current array values", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(arraySchema, notify) as {
      items: OutputBinder[];
      push: (init?: unknown) => void;
      value: unknown[];
    };

    binder.push("first");
    binder.push("second");

    expect(binder.value).toEqual(["first", "second"]);
  });

  test("modifying item updates array value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(arraySchema, notify) as {
      items: Array<{ value: string; onChange: (v: string) => void }>;
      value: unknown[];
    };

    (binder as { push: () => void }).push();
    binder.items[0].onChange("updated");

    expect(binder.value).toEqual(["updated"]);
  });
});

// ============================================================================
// Object Binder Tests
// ============================================================================

describe("ObjectBinder", () => {
  const objectSchema: JsonSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
  };

  test("initializes with child binders for each field", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(objectSchema, notify) as {
      _kind: string;
      name: OutputBinder;
      age: OutputBinder;
    };

    expect(binder._kind).toBe("object");
    expect(binder.name._kind).toBe("string");
    expect(binder.age._kind).toBe("number");
  });

  test("initializes child binders with initial values", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(objectSchema, notify, undefined, {
      name: "Alice",
      age: 30,
    }) as {
      name: { value: string };
      age: { value: string; _numericValue: number };
    };

    expect(binder.name.value).toBe("Alice");
    expect(binder.age._numericValue).toBe(30);
  });

  test("value returns object with all field values", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(objectSchema, notify, undefined, {
      name: "Bob",
      age: 25,
    });

    expect((binder as { value: Record<string, unknown> }).value).toEqual({ name: "Bob", age: 25 });
  });

  test("changing child updates parent value", () => {
    const notify = createNotify();
    const binder = buildOutputBinder(objectSchema, notify) as {
      name: { onChange: (v: string) => void };
      age: { onChange: (v: number) => void };
      value: Record<string, unknown>;
    };

    binder.name.onChange("Charlie");
    binder.age.onChange(35);

    expect(binder.value).toEqual({ name: "Charlie", age: 35 });
  });

  test("nested object binders work correctly", () => {
    const notify = createNotify();
    const nestedSchema: JsonSchema = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
        },
      },
    };
    const binder = buildOutputBinder(nestedSchema, notify, undefined, {
      user: { name: "Dave", email: "dave@example.com" },
    }) as {
      user: {
        name: { value: string };
        email: { value: string };
        value: Record<string, unknown>;
      };
      value: Record<string, unknown>;
    };

    expect(binder.user.name.value).toBe("Dave");
    expect(binder.user.email.value).toBe("dave@example.com");
    expect(binder.value).toEqual({
      user: { name: "Dave", email: "dave@example.com" },
    });
  });
});

// ============================================================================
// getBinderValue Tests
// ============================================================================

describe("getBinderValue", () => {
  test("returns string value for string binder", () => {
    const binder = buildOutputBinder({ type: "string" }, () => {}, undefined, "test");
    expect(getBinderValue(binder)).toBe("test");
  });

  test("returns numeric value for number binder", () => {
    const binder = buildOutputBinder({ type: "number" }, () => {}, undefined, 42);
    expect(getBinderValue(binder)).toBe(42);
  });

  test("returns checked for boolean binder", () => {
    const binder = buildOutputBinder({ type: "boolean" }, () => {}, undefined, true);
    expect(getBinderValue(binder)).toBe(true);
  });

  test("returns string value for enum binder", () => {
    const binder = buildOutputBinder(
      { enum: ["a", "b"] },
      () => {},
      undefined,
      "b",
    );
    expect(getBinderValue(binder)).toBe("b");
  });

  test("returns array for array binder", () => {
    const binder = buildOutputBinder(
      { type: "array", items: { type: "string" } },
      () => {},
      undefined,
      ["x", "y"],
    );
    expect(getBinderValue(binder)).toEqual(["x", "y"]);
  });

  test("returns object for object binder", () => {
    const binder = buildOutputBinder(
      { type: "object", properties: { foo: { type: "string" } } },
      () => {},
      undefined,
      { foo: "bar" },
    );
    expect(getBinderValue(binder)).toEqual({ foo: "bar" });
  });
});
