"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";
import { IconMoodSmile } from "@tabler/icons-react";

const Picker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement | null, text: string) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function insertIntoValue(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  setValue: (next: string) => void,
  emoji: string
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  setValue(value.slice(0, start) + emoji + value.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    const pos = start + emoji.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="emoji-wrap" ref={rootRef}>
      <button
        type="button"
        className="emoji-btn"
        aria-label="Add emoji"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMoodSmile size={18} />
      </button>
      {open ? (
        <div className="emoji-popover">
          <Picker
            data={data}
            onEmojiSelect={(emoji: { native: string }) => {
              onSelect(emoji.native);
              setOpen(false);
            }}
            theme="light"
            previewPosition="none"
            maxFrequentRows={1}
            perLine={8}
          />
        </div>
      ) : null}
    </div>
  );
}
