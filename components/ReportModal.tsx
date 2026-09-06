"use client";

import { useState } from "react";
import { createReport } from "@/app/actions/account";

export function ReportModal({
  targetType,
  postId,
  commentId,
  onClose,
}: {
  targetType: "post" | "comment";
  postId: string;
  commentId?: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(formData: FormData) {
    formData.set("target_type", targetType);
    formData.set("post_id", postId);
    if (commentId) formData.set("comment_id", commentId);
    setError(null);
    try {
      await createReport(formData);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that report.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h2>Thanks — we received it</h2>
            <p>Leaders will review this in the admin queue.</p>
            <div className="modal-actions">
              <button className="btn-primary" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form action={onSubmit}>
            <h2>Report this {targetType}</h2>
            <p>Tell the leaders why this should be reviewed. Your name is included for pastoral follow-up.</p>
            {error ? <div className="banner-error">{error}</div> : null}
            <textarea
              className="form-input form-textarea tall"
              name="reason"
              required
              placeholder="What's going on?"
            />
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" type="submit">
                Send report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
