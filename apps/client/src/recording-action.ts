import type { RecordingCursorHandle } from "./RecordingCursor";
import type { ChatComposerHandle } from "./ChatComposer";

export type RecordingActionContext = {
  cursorRef: React.RefObject<RecordingCursorHandle | null>;
  composerRef: React.RefObject<ChatComposerHandle | null>;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForElement(selector: string, timeoutMs = 5000): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(100);
  }
  console.warn(`[recording.action] element not found: ${selector}`);
  return null;
}

function getElementCenter(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Trigger React-compatible input changes
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function executeRecordingAction(
  source: string,
  ctx: RecordingActionContext,
): Promise<void> {
  const cursor = {
    move: async (selector: string, opts?: { duration?: number }) => {
      const el = await waitForElement(selector);
      if (!el) return;
      const { x, y } = getElementCenter(el);
      await ctx.cursorRef.current?.move(x, y, opts?.duration);
    },
    click: async (selector?: string) => {
      const el = selector ? await waitForElement(selector) : null;
      if (selector && el) {
        const { x, y } = getElementCenter(el);
        await ctx.cursorRef.current?.move(x, y);
        await sleep(100);
      }
      await ctx.cursorRef.current?.click();
      if (el) {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    },
    type: async (selector: string, text: string, opts?: { delay?: number }) => {
      const el = await waitForElement(selector);
      if (!el) return;
      const { x, y } = getElementCenter(el);
      await ctx.cursorRef.current?.move(x, y);
      await sleep(200);
      (el as HTMLElement).focus();
      const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
      for (const char of text) {
        setNativeValue(inputEl, inputEl.value + char);
        await sleep(opts?.delay ?? 50);
      }
    },
    hide: () => ctx.cursorRef.current?.hide(),
    show: () => ctx.cursorRef.current?.show(),
  };

  const wait = (ms: number) => sleep(ms);

  const composer = {
    type: async (text: string, opts?: { delay?: number }) => {
      for (const char of text) {
        ctx.composerRef.current?.typeChar(char);
        await sleep(opts?.delay ?? (45 + Math.random() * 35));
      }
    },
    submit: () => ctx.composerRef.current?.submit(),
  };

  const recorder = {
    stop: () => { (window as any).__fenced_record_stop = true; },
  };

  const fn = new Function(
    "cursor",
    "wait",
    "composer",
    "recorder",
    `return (async () => {\n${source}\n})();`,
  );

  await fn(cursor, wait, composer, recorder);
}
