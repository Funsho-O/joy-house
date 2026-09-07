"use client";

import { useState, useTransition } from "react";
import { createGroupPost } from "@/app/actions/groups";

export function GroupComposer({ groupId, open }: { groupId: string; open: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    formData.set("group_id", groupId);
    setError(null);
    startTransition(async () => {
      try {
        await createGroupPost(formData);
        (document.getElementById("groupPostTitle") as HTMLInputElement | null)?.form?.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not publish that post.");
      }
    });
  }

  return (
    <form className={`composer${open ? " open" : ""}`} action={onSubmit}>
      <div className="composer-title">Share something with the group</div>
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="form-row">
        <label className="form-label" htmlFor="groupPostTitle">
          Title
        </label>
        <input
          className="form-input"
          id="groupPostTitle"
          name="title"
          type="text"
          placeholder="What's on your mind?"
          required
        />
      </div>
      <div className="form-row">
        <label className="form-label" htmlFor="groupPostBody">
          Body (optional)
        </label>
        <textarea
          className="form-input form-textarea"
          id="groupPostBody"
          name="body"
          placeholder="Share more details..."
        />
      </div>
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Posting..." : "Post to group"}
      </button>
    </form>
  );
}
