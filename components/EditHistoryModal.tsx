"use client";

import { useEffect, useState } from "react";
import { fetchCommentRevisions } from "@/app/actions/comments";
import { fetchGroupCommentRevisions, fetchGroupPostRevisions } from "@/app/actions/groups";
import { fetchPostRevisions } from "@/app/actions/posts";
import type { CommentRevision, PostRevision } from "@/lib/types";

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EditHistoryModal({
  kind,
  id,
  currentTitle,
  currentBody,
  editedAt,
  onClose,
}: {
  kind: "post" | "comment" | "group-post" | "group-comment";
  id: string;
  currentTitle?: string;
  currentBody: string;
  editedAt: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [postRevisions, setPostRevisions] = useState<PostRevision[] | null>(null);
  const [commentRevisions, setCommentRevisions] = useState<CommentRevision[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (kind === "post") {
          const rows = await fetchPostRevisions(id);
          if (!cancelled) setPostRevisions(rows);
        } else if (kind === "group-post") {
          const rows = await fetchGroupPostRevisions(id);
          if (!cancelled) setPostRevisions(rows);
        } else if (kind === "group-comment") {
          const rows = await fetchGroupCommentRevisions(id);
          if (!cancelled) setCommentRevisions(rows);
        } else {
          const rows = await fetchCommentRevisions(id);
          if (!cancelled) setCommentRevisions(rows);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load edit history.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const showPostHistory = kind === "post" || kind === "group-post";
  const loading = showPostHistory ? postRevisions === null && !error : commentRevisions === null && !error;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal history-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Edit history</h2>
        <p>
          Previous versions of this {showPostHistory ? "post" : "comment"}. Only admins can see this.
        </p>
        {error ? <div className="banner-error">{error}</div> : null}
        {loading ? <p className="anon-hint">Loading previous versions…</p> : null}
        {showPostHistory && postRevisions
          ? postRevisions.map((revision, index) => (
              <div className="history-item" key={revision.id}>
                <div className="history-item-label">
                  Version {index + 1} · replaced {formatStamp(revision.created_at)}
                </div>
                <div className="history-item-title">{revision.title}</div>
                {revision.body ? <div className="history-item-body">{revision.body}</div> : null}
              </div>
            ))
          : null}
        {!showPostHistory && commentRevisions
          ? commentRevisions.map((revision, index) => (
              <div className="history-item" key={revision.id}>
                <div className="history-item-label">
                  Version {index + 1} · replaced {formatStamp(revision.created_at)}
                </div>
                <div className="history-item-body">{revision.body}</div>
              </div>
            ))
          : null}
        <div className="history-item current">
          <div className="history-item-label">Current · edited {formatStamp(editedAt)}</div>
          {showPostHistory && currentTitle ? <div className="history-item-title">{currentTitle}</div> : null}
          {currentBody ? <div className="history-item-body">{currentBody}</div> : null}
        </div>
        <div className="modal-actions">
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
