# @fenced/component-render

React component that renders server-provided UI code and binds it to live data proxies. The component compiles a `source` string into a React factory, proxies `data`/`streamedData` with Valtio, and exposes a schema-driven output binder to capture user input.

## What it does
- Compiles the provided `source` string into a `(data, streamedData, output) => ReactNode` factory.
- Wraps `data` and `streamedData` in Valtio proxies so UI code can mutate and observe state directly.
- Builds binders from `SchemaShape` definitions (string/number/enum/boolean/date/array/object) with reset/clear/null helpers.
- Skips invalid UI code gracefully and shows an error message instead of crashing the app.

## Usage
```tsx
import { ComponentRender } from "@fenced/component-render";
import type { SchemaShape } from "@fenced/shared";

const outputSchemaShape: SchemaShape = { kind: "string" } as never; // server-provided

<ComponentRender
  source={`(data, _streamed, output) => <button onClick={() => output.onChange("ok")}>Save</button>`}
  data={{ count: 0 }}
  streamedData={{}}
  outputSchemaShape={outputSchemaShape}
/>;
```
