import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { useLocalStorage } from "react-use";

type ChatComposerProps = {
  onSubmit: (text: string) => void;
  disabled: boolean;
};

const HISTORY_KEY = "chat-input-history";
const MAX_HISTORY = 50;

export function ChatComposer({ onSubmit, disabled }: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [history = [], setHistory] = useLocalStorage<string[]>(HISTORY_KEY, []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftBeforeNavigationRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset history index when history changes externally
  useEffect(() => {
    setHistoryIndex(-1);
    draftBeforeNavigationRef.current = null;
  }, [history.length]);

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;

    // Add to history
    const newHistory = [...history, text];
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    setHistory(newHistory);

    // Reset state
    setDraft("");
    setHistoryIndex(-1);
    draftBeforeNavigationRef.current = null;

    onSubmit(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
      return;
    }

    if (event.key === "ArrowUp") {
      // Only navigate history if cursor is at the start or textarea is empty
      const cursorAtStart = textarea?.selectionStart === 0 && textarea?.selectionEnd === 0;
      const isEmpty = draft === "";

      if (!cursorAtStart && !isEmpty) return;
      if (history.length === 0) return;

      event.preventDefault();

      // Save current draft before navigating
      if (historyIndex === -1) {
        draftBeforeNavigationRef.current = draft;
      }

      const newIndex = historyIndex === -1
        ? history.length - 1
        : Math.max(0, historyIndex - 1);

      setHistoryIndex(newIndex);
      setDraft(history[newIndex] ?? "");
      return;
    }

    if (event.key === "ArrowDown") {
      // Only handle if we're navigating history
      if (historyIndex === -1) return;

      const cursorAtEnd = textarea?.selectionStart === draft.length;
      if (!cursorAtEnd && draft !== "") return;

      event.preventDefault();

      if (historyIndex >= history.length - 1) {
        // Return to current draft
        setHistoryIndex(-1);
        setDraft(draftBeforeNavigationRef.current ?? "");
        draftBeforeNavigationRef.current = null;
      } else {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setDraft(history[newIndex] ?? "");
      }
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer-box">
        <textarea
          ref={textareaRef}
          id="chat-input"
          placeholder="Ask the agent something…"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            // Reset history navigation when user types
            if (historyIndex !== -1) {
              setHistoryIndex(-1);
              draftBeforeNavigationRef.current = null;
            }
          }}
          onKeyDown={onKeyDown}
          rows={2}
        />
        <button type="submit" className="send-button" disabled={!draft.trim() || disabled}>
          Send
        </button>
      </div>
    </form>
  );
}
