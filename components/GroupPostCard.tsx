"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { deleteGroupPost, toggleGroupLike, updateGroupPost } from "@/app/actions/groups";
import { EmojiPickerButton, insertIntoValue } from "@/components/EmojiPickerButton";
import { EditHistoryModal } from "@/components/EditHistoryModal";
import { useEditWindow } from "@/components/EditWindowNote";
import { EditedLabel, RelativeTime } from "@/components/RelativeTime";
import type { GroupPostData, Profile } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";

export function GroupPostCard({
  post,
  profile,
  showPreview = true,
}: {
  post: GroupPostData;
  profile: Profile;
  showPreview?: boolean;
}) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editBody, setEditBody] = useState(post.body);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"title" | "body">("body");
  const isAdmin = profile.role === "admin";
  const isOwner = post.author_id === profile.id;
  const editWindow = useEditWindow(post.created_at, isOwner);
  const canEdit = isOwner && editWindow.canEdit;
  const canDelete = isAdmin || isOwner;
  const href = `/groups/${post.group_id}/posts/${post.id}`;

  useEffect(() => {
    if (editing && !canEdit) setEditing(false);
  }, [editing, canEdit]);

  function onLike() {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((n) => n + (nextLiked ? 1 : -1));
    startTransition(async () => {
      try {
        await toggleGroupLike(post.id, post.group_id, liked);
      } catch {
        setLiked(liked);
        setLikes(post.like_count);
      }
    });
  }

  return (
    <article className="post-card">
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="post-header">
        <UserAvatar name={post.author_name} src={post.author_avatar_url} />
        <div className="post-meta">
          <div className="post-author">
            <a className="author-link" href={`/members/${post.author_id}`}>
              {post.author_name}
            </a>
          </div>
          <div className="post-time">
            <RelativeTime iso={post.created_at} />
            <EditedLabel at={post.edited_at} isAdmin={isAdmin} onOpen={() => setHistoryOpen(true)} />
            {editWindow.note ? <span className="edit-window-note">{editWindow.note}</span> : null}
          </div>
        </div>
      </div>
      {editing ? (
        <form
          className="edit-box"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData();
            formData.set("id", post.id);
            formData.set("group_id", post.group_id);
            formData.set("title", editTitle);
            formData.set("body", editBody);
            setError(null);
            startTransition(async () => {
              try {
                await updateGroupPost(formData);
                setEditing(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save that post.");
              }
            });
          }}
        >
          <input
            className="form-input"
            ref={titleRef}
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onFocus={() => {
              lastField.current = "title";
            }}
            required
          />
          <textarea
            className="form-input form-textarea"
            ref={bodyRef}
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            onFocus={() => {
              lastField.current = "body";
            }}
          />
          <div className="composer-tools">
            <EmojiPickerButton
              onSelect={(emoji) =>
                lastField.current === "title"
                  ? insertIntoValue(titleRef.current, editTitle, setEditTitle, emoji)
                  : insertIntoValue(bodyRef.current, editBody, setEditBody, emoji)
              }
            />
            <button className="btn-secondary" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-primary" type="submit">
              Save
            </button>
            {editWindow.note ? <span className="edit-window-note">{editWindow.note}</span> : null}
          </div>
        </form>
      ) : (
        <a href={href}>
          <h2 className="post-title">{post.title}</h2>
          {post.body ? <p className="post-body">{post.body}</p> : <div className="post-body" />}
        </a>
      )}
      <div className="post-footer">
        <button className={`action-btn${liked ? " liked" : ""}`} type="button" onClick={onLike}>
          {liked ? <IconHeartFilled size={15} /> : <IconHeart size={15} />} {likes}
        </button>
        <a className="action-btn" href={href}>
          <IconMessageCircle size={15} /> {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}
        </a>
        {canEdit ? (
          <button
            className="action-btn"
            type="button"
            onClick={() => {
              setEditTitle(post.title);
              setEditBody(post.body);
              setEditing((value) => !value);
              setError(null);
            }}
          >
            <IconPencil size={15} /> Edit
          </button>
        ) : null}
        {canDelete ? (
          <button
            className="action-btn danger ml-auto"
            type="button"
            onClick={() => {
              if (!confirm("Delete this post?")) return;
              startTransition(async () => {
                try {
                  await deleteGroupPost(post.id, post.group_id);
                  if (window.location.pathname.includes("/posts/")) {
                    window.location.href = `/groups/${post.group_id}`;
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not delete.");
                }
              });
            }}
          >
            <IconTrash size={15} /> Delete
          </button>
        ) : null}
      </div>
      {showPreview && post.preview_comments.length > 0 ? (
        <div className="comment-preview">
          {post.preview_comments.map((comment) => (
            <div className="comment" key={comment.id}>
              <UserAvatar name={comment.author_name} src={comment.author_avatar_url} className="comment-av" />
              <div className="comment-body">
                <span className="comment-author">{comment.author_name}</span>
                {comment.body}
              </div>
            </div>
          ))}
          {post.comment_count > 2 ? (
            <a className="view-more" href={href}>
              View all {post.comment_count} replies
            </a>
          ) : null}
        </div>
      ) : null}
      {historyOpen && post.edited_at ? (
        <EditHistoryModal
          kind="group-post"
          id={post.id}
          currentTitle={post.title}
          currentBody={post.body}
          editedAt={post.edited_at}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </article>
  );
}
