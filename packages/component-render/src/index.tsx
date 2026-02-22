import React, { Component, useMemo, useReducer, useRef } from "react";
import { proxy, useSnapshot } from "valtio";
import * as Mui from "@mui/material";
import type { JsonSchema } from "@fenced/shared";
import { buildOutputBinder, type OutputBinder } from "./binder";

export type { OutputBinder } from "./binder";

export type ComponentRenderProps = {
  source: string;
  data: Record<string, unknown>;
  streamedData?: Record<string, unknown> | null;
  outputSchema: JsonSchema;
  callbackNames?: string[];
  onSubmit?: (value: unknown) => void;
  onCallbackInvoke?: (name: string, args: unknown[]) => void;
};

export type CallbacksProxy = Record<string, (...args: unknown[]) => void>;

// ============================================================================
// Helpers
// ============================================================================

const cloneValue = <T,>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return value === undefined ? ({} as T) : JSON.parse(JSON.stringify(value));
};

const useValtioSource = (value: Record<string, unknown>): Record<string, unknown> => {
  const store = useMemo(() => proxy(cloneValue(value)), [value]);
  const snapshot = useSnapshot(store);
  void snapshot;
  return store;
};

// ============================================================================
// UI Compilation
// ============================================================================

// Collect MUI component names and values for injection
const muiComponentNames = Object.keys(Mui);
const muiComponentValues = Object.values(Mui);

type UiProps = {
  data: Record<string, unknown>;
  streamedData: Record<string, unknown>;
  output: OutputBinder;
  callbacks: CallbacksProxy;
};

type UiFunction = (props: UiProps) => React.ReactNode;

const compileUi = (source: string): UiFunction | null => {
  try {
    const factory = new Function(
      "React",
      ...muiComponentNames,
      `return ${source};`,
    ) as (
      reactObj: typeof React,
      ...components: unknown[]
    ) => UiFunction;

    return factory(React, ...muiComponentValues);
  } catch (error) {
    console.error("Failed to compile UI source", error);
    return null;
  }
};

// ============================================================================
// Error Boundary
// ============================================================================

type ErrorBoundaryProps = {
  source: string;
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class ComponentRenderErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, border: "1px solid #f44336", borderRadius: 4, backgroundColor: "#ffebee" }}>
          <div style={{ color: "#d32f2f", fontWeight: "bold", marginBottom: 8 }}>
            Component Render Error
          </div>
          <div style={{ color: "#c62828", marginBottom: 12 }}>
            {this.state.error.message}
          </div>
          <details>
            <summary style={{ cursor: "pointer", color: "#666", marginBottom: 8 }}>
              View source code
            </summary>
            <pre style={{
              backgroundColor: "#f5f5f5",
              padding: 12,
              borderRadius: 4,
              overflow: "auto",
              fontSize: 12,
              maxHeight: 300
            }}>
              {this.props.source}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Main Component
// ============================================================================

function ComponentRenderInner({
  source,
  data,
  streamedData,
  outputSchema,
  callbackNames,
  onSubmit,
  onCallbackInvoke,
}: ComponentRenderProps) {
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);

  const dataProxy = useValtioSource(data);
  const streamedDataProxy = useValtioSource(streamedData ?? {});

  // Use ref for onSubmit to avoid recreating binder when callback identity changes
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // Build output binder from JSON schema with submit handler baked in
  const outputBinder = useMemo(
    () => buildOutputBinder(outputSchema, forceUpdate, (value) => onSubmitRef.current?.(value)),
    [outputSchema],
  );

  // Wrap binder to inject onSubmit into Form components
  const wrappedBinder = useMemo(() => {
    if (outputBinder._kind === "object") {
      // Create a proxy that intercepts Form usage
      return new Proxy(outputBinder, {
        get(target, prop) {
          if (prop === "_onSubmit") return onSubmitRef.current;
          return target[prop as keyof typeof target];
        },
      });
    }
    return outputBinder;
  }, [outputBinder]);

  // Create callbacks proxy from callback names
  const callbacksProxy = useMemo<CallbacksProxy>(() => {
    if (!callbackNames || !onCallbackInvoke) return {};
    const callbacks: CallbacksProxy = {};
    for (const name of callbackNames) {
      callbacks[name] = (...args: unknown[]) => onCallbackInvoke(name, args);
    }
    return callbacks;
  }, [callbackNames, onCallbackInvoke]);

  const ui = useMemo(() => compileUi(source), [source]);

  if (typeof ui !== "function") {
    return <p style={{ color: "#d32f2f" }}>Unable to compile UI payload.</p>;
  }

  return <>{ui({ data: dataProxy, streamedData: streamedDataProxy, output: wrappedBinder, callbacks: callbacksProxy })}</>;
}

export function ComponentRender(props: ComponentRenderProps) {
  return (
    <ComponentRenderErrorBoundary source={props.source}>
      <ComponentRenderInner {...props} />
    </ComponentRenderErrorBoundary>
  );
}
