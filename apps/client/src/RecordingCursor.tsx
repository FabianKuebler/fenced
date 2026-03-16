import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";

export type RecordingCursorHandle = {
  move: (x: number, y: number, durationMs?: number) => Promise<void>;
  click: () => Promise<void>;
  hide: () => void;
  show: () => void;
};

const CURSOR_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M3 2l12 9.5-5.5 1.2L6.8 18z" fill="#000" stroke="#fff" stroke-width="1.2"/></svg>`)}`;

export const RecordingCursor = forwardRef<RecordingCursorHandle>(function RecordingCursor(_, ref) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const move = useCallback((x: number, y: number, durationMs = 400): Promise<void> => {
    return new Promise((resolve) => {
      const el = cursorRef.current;
      if (!el) { resolve(); return; }

      setVisible(true);

      // If already at target position, resolve immediately (no transition fires)
      const currentX = parseFloat(el.style.left) || 0;
      const currentY = parseFloat(el.style.top) || 0;
      if (Math.abs(currentX - x) < 1 && Math.abs(currentY - y) < 1) {
        resolve();
        return;
      }

      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener("transitionend", settle);
        resolve();
      };

      el.style.transition = `left ${durationMs}ms cubic-bezier(0.4,0,0.2,1), top ${durationMs}ms cubic-bezier(0.4,0,0.2,1)`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      el.addEventListener("transitionend", settle);
      setTimeout(settle, durationMs + 50);
    });
  }, []);

  const click = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const el = cursorRef.current;
      if (!el) { resolve(); return; }

      // Visual click feedback
      el.style.transform = "scale(0.8)";
      setTimeout(() => {
        el.style.transform = "scale(1)";
        resolve();
      }, 150);
    });
  }, []);

  const hide = useCallback(() => setVisible(false), []);
  const show = useCallback(() => setVisible(true), []);

  useImperativeHandle(ref, () => ({ move, click, hide, show }));

  return (
    <div
      ref={cursorRef}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        pointerEvents: "none",
        zIndex: 99999,
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms",
        transform: "scale(1)",
      }}
    >
      <img src={CURSOR_SVG} width={20} height={20} alt="" draggable={false} />
    </div>
  );
});
