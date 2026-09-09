"use client";

import { useEffect, useState, type ComponentType } from "react";

export function PushPromptHost() {
  const [Prompt, setPrompt] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@/components/PushPrompt").then((mod) => {
      if (!cancelled) setPrompt(() => mod.PushPrompt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Prompt) return null;
  return <Prompt />;
}
