"use client";

import { useEffect, useState } from "react";
import { editWindowRemaining, formatEditCountdown } from "@/lib/edit-window";

export function useEditWindow(createdAt: string, enabled = true) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(editWindowRemaining(createdAt));
    tick();
    const id = window.setInterval(() => {
      const next = editWindowRemaining(createdAt);
      setRemaining(next);
      if (next <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [createdAt, enabled]);

  const canEdit = Boolean(enabled && remaining && remaining > 0);
  return {
    canEdit,
    remaining: remaining ?? 0,
    note: canEdit ? `You can edit for ${formatEditCountdown(remaining as number)}` : null,
  };
}

export function EditWindowNote({ createdAt, enabled = true }: { createdAt: string; enabled?: boolean }) {
  const { note } = useEditWindow(createdAt, enabled);
  if (!note) return null;
  return <span className="edit-window-note">{note}</span>;
}
