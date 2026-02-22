import { randomUUID } from "node:crypto";
import { proxy, snapshot, subscribe } from "valtio/vanilla";
import type { DataPatch } from "@fenced/shared";

type DataId = string;

const DATA_ID = Symbol.for("fenced.data.id");
const STREAMED_DATA_ID = Symbol.for("fenced.streameddata.id");
const STREAMED_DATA_VALUE = Symbol.for("fenced.streameddata.value");

export type DataPatchListener = (patches: DataPatch[]) => void;

/**
 * Transport-agnostic Data wrapper built on Valtio. Each instance is a proxied
 * plain object tagged with a hidden id. Static helpers expose the id, take
 * snapshots without metadata, and fan-out change notifications per proxy.
 */
export class Data<T extends object = object> {
  private static readonly subscriptions = new WeakMap<
    object,
    { unsubscribe: () => void; listeners: Set<DataPatchListener> }
  >();

  constructor(initial: T) {
    const state = proxy(initial) as T & { [DATA_ID]?: DataId };
    Object.defineProperty(state, DATA_ID, {
      value: randomUUID() as DataId,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return state as unknown as Data<T>;
  }

  static getId(data: object): DataId {
    const id = (data as Record<symbol | string, unknown>)[DATA_ID];
    if (typeof id !== "string") {
      throw new Error("Data instance is missing an id. Did it come from this Data constructor?");
    }
    return id as DataId;
  }

  static snapshot<T extends object>(data: T): T {
    const copy = snapshot(data) as Record<PropertyKey, unknown>;
    if (DATA_ID in copy) {
      delete copy[DATA_ID];
    }
    return copy as T;
  }

  /**
   * Subscribe to Valtio ops on a data proxy. Only one underlying Valtio
   * subscription exists per proxy; multiple listeners share it. Returns an
   * unsubscribe for the caller's listener.
   */
  static subscribeToChanges(data: object, listener: DataPatchListener): () => void {
    const existing = Data.subscriptions.get(data);
    if (existing) {
      existing.listeners.add(listener);
      return () => {
        existing.listeners.delete(listener);
        if (existing.listeners.size === 0) {
          existing.unsubscribe();
          Data.subscriptions.delete(data);
        }
      };
    }

    const listeners = new Set<DataPatchListener>([listener]);
    const unsubscribe = subscribe(data, (ops) => {
      if (!ops.length) return;
      for (const fn of listeners) {
        fn(ops as DataPatch[]);
      }
    });

    Data.subscriptions.set(data, { unsubscribe, listeners });

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        unsubscribe();
        Data.subscriptions.delete(data);
      }
    };
  }
}

/**
 * StreamedData is a proxy class for receiving LLM-streamed JSON via `json agent.data` blocks.
 * Properties are accessed directly: `streamed.myField` (not `streamed.value.myField`).
 *
 * - Before any stream: all properties return `undefined`.
 * - On server: populated after the json agent.data fence completes.
 * - On client: populated incrementally as JSON parses.
 * - Each new agent.data block targeting the same ID fully replaces the data (no merging).
 */
export class StreamedData {
  private static readonly registry = new Map<string, StreamedData>();

  declare private [STREAMED_DATA_ID]: string;
  declare private [STREAMED_DATA_VALUE]: Record<string, unknown>;

  constructor(id: string) {
    Object.defineProperty(this, STREAMED_DATA_ID, {
      value: id,
      enumerable: false,
      writable: false,
      configurable: false,
    });

    Object.defineProperty(this, STREAMED_DATA_VALUE, {
      value: {},
      enumerable: false,
      writable: true,
      configurable: false,
    });

    const proxied = new Proxy(this, {
      get(target, prop) {
        // Allow access to the ID
        if (prop === "id") {
          return target[STREAMED_DATA_ID];
        }
        // Allow instanceof checks
        if (prop === Symbol.toStringTag) {
          return "StreamedData";
        }
        // Symbol properties and prototype methods
        if (typeof prop === "symbol") {
          return target[prop as keyof typeof target];
        }
        // Access data properties directly
        return target[STREAMED_DATA_VALUE][prop as string];
      },
      set(target, prop, value) {
        // Allow setData() to replace the internal value
        if (prop === STREAMED_DATA_VALUE) {
          (target as Record<symbol, unknown>)[STREAMED_DATA_VALUE] = value;
          return true;
        }
        if (typeof prop === "symbol") {
          return false;
        }
        target[STREAMED_DATA_VALUE][prop as string] = value;
        return true;
      },
      has(target, prop) {
        if (prop === "id") return true;
        if (typeof prop === "symbol") return prop in target;
        return prop in target[STREAMED_DATA_VALUE];
      },
      ownKeys(target) {
        return ["id", ...Object.keys(target[STREAMED_DATA_VALUE])];
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === "id") {
          return { configurable: true, enumerable: true, value: target[STREAMED_DATA_ID] };
        }
        if (typeof prop === "symbol") {
          return Object.getOwnPropertyDescriptor(target, prop);
        }
        const value = target[STREAMED_DATA_VALUE][prop as string];
        if (value !== undefined) {
          return { configurable: true, enumerable: true, value };
        }
        return undefined;
      },
    }) as unknown as StreamedData & Record<string, unknown>;

    // Register the instance
    StreamedData.registry.set(id, proxied);

    // Constructor can return a different object (the proxy)
    return proxied;
  }

  /** @deprecated Use constructor: `new StreamedData(id)` */
  static create(id: string): StreamedData & Record<string, unknown> {
    return new StreamedData(id) as StreamedData & Record<string, unknown>;
  }

  /**
   * Get the ID of a StreamedData instance.
   */
  static getId(streamed: StreamedData): string {
    const id = (streamed as Record<symbol | string, unknown>)[STREAMED_DATA_ID];
    if (typeof id !== "string") {
      throw new Error("StreamedData instance is missing an id");
    }
    return id;
  }

  /**
   * Set the data on a StreamedData instance. Called by the runtime when
   * a json agent.data fence completes.
   */
  static setData(streamed: StreamedData, data: Record<string, unknown>): void {
    const target = streamed as Record<symbol | string, unknown>;
    target[STREAMED_DATA_VALUE] = data;
  }

  /**
   * Get the current data value from a StreamedData instance.
   */
  static getData(streamed: StreamedData): Record<string, unknown> {
    const target = streamed as Record<symbol | string, unknown>;
    return (target[STREAMED_DATA_VALUE] as Record<string, unknown>) ?? {};
  }

  /**
   * Get a registered StreamedData instance by ID.
   */
  static getById(id: string): StreamedData | undefined {
    return StreamedData.registry.get(id);
  }

  /**
   * Check if an ID is registered.
   */
  static hasId(id: string): boolean {
    return StreamedData.registry.has(id);
  }

  /**
   * Unregister a StreamedData instance (for cleanup).
   */
  static unregister(id: string): boolean {
    return StreamedData.registry.delete(id);
  }

  /**
   * Clear all registered instances (for testing/session cleanup).
   */
  static clearRegistry(): void {
    StreamedData.registry.clear();
  }
}
