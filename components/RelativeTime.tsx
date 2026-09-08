"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/format";

export function useRelativeTime(iso: string | null | undefined) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!iso) {
      setLabel("");
      return;
    }
    const tick = () => setLabel(relativeTime(iso));
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [iso]);

  return label;
}

export function RelativeTime({ iso }: { iso: string }) {
  return <>{useRelativeTime(iso)}</>;
}

export function EditedLabel({
  at,
  isAdmin,
  onOpen,
}: {
  at: string | null;
  isAdmin: boolean;
  onOpen: () => void;
}) {
  const when = useRelativeTime(at);
  const title = when ? `Edited ${when}` : undefined;
  if (!at) return null;
  if (isAdmin) {
    return (
      <button type="button" className="edited-label edited-label-btn" title={title} onClick={onOpen}>
        Edited
      </button>
    );
  }
  return (
    <span className="edited-label" title={title}>
      Edited
    </span>
  );
}
