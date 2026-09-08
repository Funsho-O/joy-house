"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconFlag, IconPencil, IconTrash } from "@tabler/icons-react";
import { createComment, deleteComment, updateComment } from "@/app/actions/comments";
import type { CommentNode, Profile } from "@/lib/types";
import { ReportModal } from "@/components/ReportModal";
import { EditHistoryModal } from "@/components/EditHistoryModal";
import { EditedLabel, RelativeTime } from "@/components/RelativeTime";
import { UserAvatar } from "@/components/UserAvatar";
import { EmojiPickerButton, insertAtCursor, insertIntoValue } from "@/components/EmojiPickerButton";
import { useEditWindow } from "@/components/EditWindowNote";

function CommentItem({
  comment,
  postId,
  profile,
  depth,
  onCreate,
  onUpdate,
  onDelete,
  allowReport,
  historyKind,
}: {
  comment: CommentNode;
  postId: string;
  profile: Profile;
  depth: number;
  onCreate: (formData: FormData) => Promise<void>;
  onUpdate?: (formData: FormData) => Promise<void>;
  onDelete: (commentId: string, postId: string) => Promise<void>;
  allowReport: boolean;
  historyKind: "comment" | "group-comment";
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isAdmin = profile.role === "admin";
  const isOwner = comment.author_id === profile.id;
  const canManage = isAdmin || isOwner;
  const editWindow = useEditWindow(comment.created_at, Boolean(isOwner && onUpdate));
  const canEdit = Boolean(onUpdate) && isOwner && editWindow.canEdit;

  useEffect(() => {
    if (editing && !canEdit) setEditing(false);
  }, [editing, canEdit]);

  return (
    <div className="comment-block">
      <div className="comment">
        <UserAvatar name={comment.author_name} src={comment.author_avatar_url} className="comment-av" />
        <div>
          {editing ? (
            <form
              className="edit-box"
              onSubmit={(event) => {
                event.preventDefault();
                if (!onUpdate) return;
                const formData = new FormData();
                formData.set("id", comment.id);
                formData.set("post_id", postId);
                formData.set("body", editBody);
                setError(null);
                startTransition(async () => {
                  try {
                    await onUpdate(formData);
                    setEditing(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not save that comment.");
                  }
                });
              }}
            >
              <textarea
                className="form-input form-textarea"
                ref={editRef}
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                required
              />
              <div className="composer-tools">
                <EmojiPickerButton onSelect={(emoji) => insertIntoValue(editRef.current, editBody, setEditBody, emoji)} />
                <button className="btn-secondary" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="btn-primary" type="submit" disabled={pending}>
                  {pending ? "Saving..." : "Save"}
                </button>
                {editWindow.note ? <span className="edit-window-note">{editWindow.note}</span> : null}
              </div>
            </form>
          ) : (
            <div className="comment-body">
              <a className="comment-author author-link" href={`/members/${comment.author_id}`}>
                {comment.author_name}
              </a>
              {comment.body}
            </div>
          )}
          <div className="comment-meta">
            <span>
              <RelativeTime iso={comment.created_at} />
            </span>
            <EditedLabel at={comment.edited_at} isAdmin={isAdmin} onOpen={() => setHistoryOpen(true)} />
            {editWindow.note ? <span className="edit-window-note">{editWindow.note}</span> : null}
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
            {canEdit ? (
              <button
                className="action-btn"
                type="button"
                onClick={() => {
                  setEditBody(comment.body);
                  setEditing((value) => !value);
                  setError(null);
                }}
              >
                <IconPencil size={13} /> Edit
              </button>
            ) : null}
            {canManage ? (
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
              <textarea
                className="form-input form-textarea"
                name="body"
                placeholder="Write a reply..."
                required
                ref={replyRef}
              />
              <div className="composer-tools">
                <EmojiPickerButton onSelect={(emoji) => insertAtCursor(replyRef.current, emoji)} />
                <button className="submit-btn comment-submit" type="submit" disabled={pending}>
                  Reply
                </button>
              </div>
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
              onUpdate={onUpdate}
              onDelete={onDelete}
              allowReport={allowReport}
              historyKind={historyKind}
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
      {historyOpen && comment.edited_at ? (
        <EditHistoryModal
          kind={historyKind}
          id={comment.id}
          currentBody={comment.body}
          editedAt={comment.edited_at}
          onClose={() => setHistoryOpen(false)}
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
  onUpdate = updateComment,
  onDelete = deleteComment,
  allowReport = true,
  allowEdit = true,
  historyKind = "comment",
}: {
  postId: string;
  comments: CommentNode[];
  profile: Profile;
  onCreate?: (formData: FormData) => Promise<void>;
  onUpdate?: (formData: FormData) => Promise<void>;
  onDelete?: (commentId: string, postId: string) => Promise<void>;
  allowReport?: boolean;
  allowEdit?: boolean;
  historyKind?: "comment" | "group-comment";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const commentRef = useRef<HTMLTextAreaElement>(null);

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
              commentRef.current?.form?.reset();
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
          ref={commentRef}
        />
        <div className="composer-tools">
          <EmojiPickerButton onSelect={(emoji) => insertAtCursor(commentRef.current, emoji)} />
          <button className="submit-btn comment-submit" type="submit" disabled={pending}>
            {pending ? "Posting..." : "Comment"}
          </button>
        </div>
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
            onUpdate={allowEdit ? onUpdate : undefined}
            onDelete={onDelete}
            allowReport={allowReport}
            historyKind={historyKind}
          />
        ))
      )}
    </section>
  );
}
