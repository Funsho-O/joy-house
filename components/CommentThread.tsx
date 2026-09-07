"use client";

import { useState, useTransition } from "react";
import { IconFlag, IconTrash } from "@tabler/icons-react";
import { createComment, deleteComment } from "@/app/actions/comments";
import { relativeTime } from "@/lib/format";
import type { CommentNode, Profile } from "@/lib/types";
import { ReportModal } from "@/components/ReportModal";
import { UserAvatar } from "@/components/UserAvatar";

function CommentItem({
  comment,
  postId,
  profile,
  depth,
  onCreate,
  onDelete,
  allowReport,
}: {
  comment: CommentNode;
  postId: string;
  profile: Profile;
  depth: number;
  onCreate: (formData: FormData) => Promise<void>;
  onDelete: (commentId: string, postId: string) => Promise<void>;
  allowReport: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canDelete = profile.role === "admin" || comment.author_id === profile.id;

  return (
    <div className="comment-block">
      <div className="comment">
        <UserAvatar name={comment.author_name} src={comment.author_avatar_url} className="comment-av" />
        <div>
          <div className="comment-body">
            <span className="comment-author">{comment.author_name}</span>
            {comment.body}
          </div>
          <div className="comment-meta">
            <span>{relativeTime(comment.created_at)}</span>
            {depth < 4 ? (
              <button className="action-btn" type="button" onClick={() => setReplyOpen((v) => !v)}>
                Reply
              </button>
            ) : null}
            {allowReport ? (
            <button className="action-btn" type="button" onClick={() => setReportOpen(true)}>
              <IconFlag size={13} /> Report
            </button>
            ) : null}
            {canDelete ? (
              <button
                className="action-btn danger"
                type="button"
                onClick={() => {
                  if (!confirm("Delete this comment?")) return;
                  startTransition(async () => {
                    try {
                      await onDelete(comment.id, postId);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not delete.");
                    }
                  });
                }}
              >
                <IconTrash size={13} /> Delete
              </button>
            ) : null}
          </div>
          {error ? <div className="banner-error">{error}</div> : null}
          {replyOpen ? (
            <form
              className="reply-box"
              action={(formData) => {
                formData.set("post_id", postId);
                formData.set("parent_id", comment.id);
                setError(null);
                startTransition(async () => {
                  try {
                    await onCreate(formData);
                    setReplyOpen(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not reply.");
                  }
                });
              }}
            >
              <textarea className="form-input form-textarea" name="body" placeholder="Write a reply..." required />
              <button className="submit-btn" type="submit" disabled={pending}>
                Reply
              </button>
            </form>
          ) : null}
        </div>
      </div>
      {comment.replies.length > 0 ? (
        <div className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              profile={profile}
              depth={depth + 1}
              onCreate={onCreate}
              onDelete={onDelete}
              allowReport={allowReport}
            />
          ))}
        </div>
      ) : null}
      {allowReport && reportOpen ? (
        <ReportModal
          targetType="comment"
          postId={postId}
          commentId={comment.id}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function CommentThread({
  postId,
  comments,
  profile,
  onCreate = createComment,
  onDelete = deleteComment,
  allowReport = true,
}: {
  postId: string;
  comments: CommentNode[];
  profile: Profile;
  onCreate?: (formData: FormData) => Promise<void>;
  onDelete?: (commentId: string, postId: string) => Promise<void>;
  allowReport?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="comment-thread">
      <div className="section-label">Replies</div>
      {error ? <div className="banner-error">{error}</div> : null}
      <form
        className="post-card"
        action={(formData) => {
          formData.set("post_id", postId);
          setError(null);
          startTransition(async () => {
            try {
              await onCreate(formData);
              (document.getElementById("new-comment") as HTMLTextAreaElement | null)?.form?.reset();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not comment.");
            }
          });
        }}
      >
        <label className="form-label" htmlFor="new-comment">
          Add a comment
        </label>
        <textarea
          className="form-input form-textarea"
          id="new-comment"
          name="body"
          placeholder="Encourage, answer, or pray with them..."
          required
        />
        <button className="submit-btn" type="submit" disabled={pending}>
          {pending ? "Posting..." : "Comment"}
        </button>
      </form>
      {comments.length === 0 ? (
        <div className="empty-state">No replies yet. Start the conversation.</div>
      ) : (
        comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            postId={postId}
            profile={profile}
            depth={0}
            onCreate={onCreate}
            onDelete={onDelete}
            allowReport={allowReport}
          />
        ))
      )}
    </section>
  );
}
