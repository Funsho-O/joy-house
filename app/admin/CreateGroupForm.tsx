"use client";

import { useState, useTransition } from "react";
import { createGroup } from "@/app/actions/groups";

export function CreateGroupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="post-card"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await createGroup(formData);
            (document.getElementById("group-name") as HTMLInputElement | null)?.form?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create that group.");
          }
        });
      }}
    >
      <div className="composer-title">Create a group</div>
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="form-row">
        <label className="form-label" htmlFor="group-name">
          Name
        </label>
        <input className="form-input" id="group-name" name="name" required placeholder="e.g. Ushering" />
      </div>
      <div className="form-row">
        <label className="form-label" htmlFor="group-desc">
          Description
        </label>
        <textarea className="form-input form-textarea" id="group-desc" name="description" placeholder="Who is this group for?" />
      </div>
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create group"}
      </button>
    </form>
  );
}
