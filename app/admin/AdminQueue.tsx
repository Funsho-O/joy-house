"use client";

import { useTransition, useState } from "react";
import { deletePost } from "@/app/actions/posts";
import { deleteComment } from "@/app/actions/comments";
import { resolveReport } from "@/app/actions/account";
import { RelativeTime } from "@/components/RelativeTime";
import type { ReportItem } from "@/lib/types";

export function AdminQueue({ reports }: { reports: ReportItem[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (reports.length === 0) {
    return <div className="empty-state">No open reports. The community is in a good place.</div>;
  }

  return (
    <>
      {error ? <div className="banner-error">{error}</div> : null}
      {reports.map((report) => (
        <article className="post-card" key={report.id}>
          <div className="post-header">
            <div className="post-meta">
              <div className="post-author">
                {report.target_type === "post" ? "Reported post" : "Reported comment"}
                <span className="post-tag tag-events">Queue</span>
              </div>
              <div className="post-time">
                <RelativeTime iso={report.created_at} /> · flagged by {report.reporter_name}
              </div>
            </div>
          </div>
          <div className="admin-reason">{report.reason}</div>
          {report.post_title ? <div className="post-title">{report.post_title}</div> : null}
          {report.comment_body ? <p className="post-body">{report.comment_body}</p> : null}
          <div className="post-footer">
            {report.post_id ? (
              <a className="action-btn" href={`/posts/${report.post_id}`}>
                Open
              </a>
            ) : null}
            <button
              className="action-btn danger"
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete the flagged content?")) return;
                startTransition(async () => {
                  try {
                    if (report.target_type === "comment" && report.comment_id && report.post_id) {
                      await deleteComment(report.comment_id, report.post_id);
                    } else if (report.post_id) {
                      await deletePost(report.post_id);
                    }
                    try {
                      await resolveReport(report.id);
                    } catch {
                      // Report row may already be gone via ON DELETE CASCADE.
                    }
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not remove that item.");
                  }
                });
              }}
            >
              Delete content
            </button>
            <button
              className="action-btn ml-auto"
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await resolveReport(report.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not dismiss.");
                  }
                })
              }
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
