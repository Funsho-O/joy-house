"use client";

import { useEffect, useState } from "react";
import { editWindowRemaining, formatEditCountdown } from "@/lib/edit-window";

export function useEditWindow(createdAt: string, enabled = true) {
  const [remaining, setRemaining] = useState(() => (enabled ? editWindowRemaining(createdAt) : 0));

  useEffect(() => {
    if (!enabled) {
      setRemaining(0);
      return;
    }
    setRemaining(editWindowRemaining(createdAt));
    const id = window.setInterval(() => {
      const next = editWindowRemaining(createdAt);
      setRemaining(next);
      if (next <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [createdAt, enabled]);

  return {
    canEdit: enabled && remaining > 0,
    remaining,
    label: formatEditCountdown(remaining),
  };
}

export function EditWindowNote({ createdAt, enabled = true }: { createdAt: string; enabled?: boolean }) {
  const { canEdit, label } = useEditWindow(createdAt, enabled);
  if (!canEdit) return null;
  return <span className="edit-window-note">You can edit for {label}</span>;
}
