"use client";

import { useRef, useState, useTransition } from "react";
import { createGroupPost } from "@/app/actions/groups";
import { EmojiPickerButton, insertAtCursor } from "@/components/EmojiPickerButton";

export function GroupComposer({ groupId, open }: { groupId: string; open: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"title" | "body">("body");

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
          ref={titleRef}
          onFocus={() => {
            lastField.current = "title";
          }}
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
          ref={bodyRef}
          onFocus={() => {
            lastField.current = "body";
          }}
        />
        <div className="composer-tools">
          <EmojiPickerButton
            onSelect={(emoji) => insertAtCursor(lastField.current === "title" ? titleRef.current : bodyRef.current, emoji)}
          />
        </div>
      </div>
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Posting..." : "Post to group"}
      </button>
    </form>
  );
}
