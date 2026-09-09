"use client";

import { useState, useTransition } from "react";
import { deactivateAccount } from "@/app/actions/account";

export function DeactivateAccountButton({
  userId,
  name,
  isSelf = false,
}: {
  userId: string;
  name: string;
  isSelf?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const message = isSelf
      ? "Deactivate your account? Your posts and comments stay on the feed as Former Member. You will be signed out and cannot log in again."
      : `Deactivate ${name}? Their posts and comments stay on the feed as Former Member. They will not be able to log in.`;
    if (!confirm(message)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deactivateAccount(userId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not deactivate that account.");
      }
    });
  }

  return (
    <div className="deactivate-zone">
      {error ? <div className="banner-error">{error}</div> : null}
      {isSelf ? (
        <p className="anon-hint">
          Your posts and comments stay on the feed as Former Member. You will not be able to log in again.
        </p>
      ) : null}
      <button className="btn-danger" type="button" disabled={pending} onClick={onClick}>
        {pending ? "Deactivating…" : isSelf ? "Deactivate account" : "Deactivate"}
      </button>
    </div>
  );
}
