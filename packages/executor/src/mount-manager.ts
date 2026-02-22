import type { RuntimeChannel } from ".";
import { Data, StreamedData } from "./data-manager";
import type { JsonSchema, MountPayload } from "@fenced/shared";
import { z } from "zod";

export type CallbackFn = (...args: unknown[]) => void;
export type CallbacksMap = Record<string, CallbackFn>;

export type MountUiProps<TData, TStreamedData, TOutput, TCallbacks> = {
  data: TData;
  streamedData: TStreamedData;
  output: TOutput;
  callbacks: TCallbacks;
};

export type MountOptions<
  TData,
  TStreamedData,
  TOutput,
  TCallbacks extends CallbacksMap = CallbacksMap,
> = {
  data?: TData;
  streamedData?: TStreamedData;
  outputSchema?: z.ZodTypeAny;
  callbacks?: TCallbacks;
  ui: (props: MountUiProps<TData, TStreamedData, TOutput, TCallbacks>) => unknown;
};

export type MountedComponent<TOutput> = {
  mountId: string;
  result: Promise<TOutput>;
};

export class MountManager {
  private readonly transpiler: Bun.Transpiler;
  private readonly callbacksByMountId = new Map<string, CallbacksMap>();

  constructor(private readonly channel: RuntimeChannel) {
    this.transpiler = new Bun.Transpiler({
      loader: "tsx",
      target: "browser",
      tsconfig: {
        compilerOptions: {
          jsx: "react",
          jsxFactory: "React.createElement",
          jsxFragmentFactory: "React.Fragment",
        },
      },
    });
    this.mount = this.mount.bind(this);
    this.invokeCallback = this.invokeCallback.bind(this);
  }

  invokeCallback(mountId: string, name: string, args: unknown[]): void {
    const callbacks = this.callbacksByMountId.get(mountId);
    if (!callbacks) {
      console.warn(`[mount-manager] No callbacks found for mountId: ${mountId}`);
      return;
    }
    const callback = callbacks[name];
    if (!callback) {
      console.warn(`[mount-manager] No callback "${name}" found for mountId: ${mountId}`);
      return;
    }
    try {
      callback(...args);
    } catch (error) {
      console.error(`[mount-manager] Callback "${name}" threw:`, error);
    }
  }

  mount<
    TData extends object,
    TStreamedData extends object,
    TOutput,
    TCallbacks extends CallbacksMap = CallbacksMap,
  >(options: MountOptions<TData, TStreamedData, TOutput, TCallbacks>): MountedComponent<TOutput> {
    const mountId = crypto.randomUUID();
    const data = options.data;
    const streamedData = options.streamedData;
    const uiSource = this.transpileUi(options.ui);

    let initialData: unknown | undefined;
    let streamedDataId: string | undefined;

    if (data) {
      initialData = Data.snapshot(data as object);
      Data.subscribeToChanges(data as object, (patches) => {
        this.channel.sendDataPatch?.({ mountId, patches });
      });
    }

    if (streamedData) {
      streamedDataId = StreamedData.getId(streamedData as StreamedData);
    }

    // Store callbacks by mountId for later invocation
    const callbackNames = options.callbacks ? Object.keys(options.callbacks) : undefined;
    if (options.callbacks) {
      this.callbacksByMountId.set(mountId, options.callbacks);
    }

    // Convert Zod schema to JSON Schema (native in Zod 4)
    const outputSchema: JsonSchema = options.outputSchema
      ? (z.toJSONSchema(options.outputSchema) as JsonSchema)
      : { type: "object", properties: {} };

    const payload: MountPayload = {
      mountId,
      uiSource,
      initialData,
      streamedDataId,
      outputSchema,
      callbackNames,
    };

    // sendMount returns a Promise that resolves when ui_submit is received
    const resultPromise = this.channel.sendMount?.(payload) ?? Promise.resolve(undefined);

    return {
      mountId,
      result: resultPromise as Promise<TOutput>,
    };
  }

  private transpileUi<TData, TStreamedData, TOutput, TCallbacks extends CallbacksMap>(
    ui: MountOptions<TData, TStreamedData, TOutput, TCallbacks>["ui"],
  ): string {
    const source = `export default ${ui.toString()};`;
    const transformed = this.transpiler.transformSync(source);
    return transformed
      .trim()
      .replace(/^export default\s*/, "")
      .replace(/;$/, "")
      .trim();
  }
}
