"use client";

import { useState, useTransition } from "react";
import { deleteGroup } from "@/app/actions/groups";

export function DeleteGroupButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      {error ? <div className="banner-error">{error}</div> : null}
      <button
        className="btn-danger"
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `Delete “${groupName}”? This removes the group, its members, and every post and comment inside it.`
            )
          ) {
            return;
          }
          startTransition(async () => {
            try {
              await deleteGroup(groupId);
              window.location.href = "/admin/groups";
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not delete that group.");
            }
          });
        }}
      >
        {pending ? "Deleting..." : "Delete group"}
      </button>
    </>
  );
}
