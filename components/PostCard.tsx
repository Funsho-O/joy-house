"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconPencil,
  IconPin,
  IconTrash,
  IconCake,
  IconFlag,
} from "@tabler/icons-react";
import { deletePost, toggleLike, togglePin, updatePost } from "@/app/actions/posts";
import { EmojiPickerButton, insertIntoValue } from "@/components/EmojiPickerButton";
import { useEditWindow } from "@/components/EditWindowNote";
import { categoryClass } from "@/lib/format";
import type { PostCardData, Profile } from "@/lib/types";
import { ReportModal } from "@/components/ReportModal";
import { EditHistoryModal } from "@/components/EditHistoryModal";
import { EditedLabel, RelativeTime } from "@/components/RelativeTime";
import { UserAvatar } from "@/components/UserAvatar";
import { PostImage } from "@/components/PostImage";

export function PostCard({
  post,
  profile,
  showPreview = true,
}: {
  post: PostCardData;
  profile: Profile;
  showPreview?: boolean;
}) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editBody, setEditBody] = useState(post.body);
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"title" | "body">("body");
  const cardRef = useRef<HTMLElement>(null);
  const [hooray, setHooray] = useState(false);
  const isBirthday = Boolean(post.is_birthday);
  const isAdmin = profile.role === "admin";
  const isOwner = post.author_id === profile.id;
  const editWindow = useEditWindow(post.created_at, isOwner && !isBirthday);
  const canEdit = isOwner && editWindow.canEdit && !isBirthday;
  const canDelete = isAdmin || (isOwner && !isBirthday);
  const publicName = post.is_anonymous && !isAdmin ? "Member" : post.author_name;
  const birthdayBody = isBirthday
    ? post.body.replace("Joy House is celebrating", "House of Joy is celebrating")
    : post.body;

  useEffect(() => {
    if (!isBirthday) return;
    const el = cardRef.current;
    if (!el) return;
    let timer: number | undefined;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function play() {
      setHooray(false);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setHooray(true));
      });
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          play();
          if (!prefersReduced && !timer) {
            timer = window.setInterval(play, 7000);
          }
        } else if (timer) {
          window.clearInterval(timer);
          timer = undefined;
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) window.clearInterval(timer);
    };
  }, [isBirthday]);

  useEffect(() => {
    if (editing && !canEdit) setEditing(false);
  }, [editing, canEdit]);

  function onLike() {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((n) => n + (nextLiked ? 1 : -1));
    startTransition(async () => {
      try {
        await toggleLike(post.id, liked);
      } catch {
        setLiked(liked);
        setLikes(post.like_count);
      }
    });
  }

  return (
    <article
      ref={cardRef}
      className={`post-card${isBirthday ? " birthday-card" : ""}`}
    >
      {isBirthday ? (
        <>
          <div className="birthday-balloons" aria-hidden="true">
            <span className="balloon b1" />
            <span className="balloon b2" />
            <span className="balloon b3" />
            <span className="balloon b4" />
            <span className="balloon b5" />
          </div>
          <div className={`birthday-hooray${hooray ? " burst" : ""}`} aria-hidden="true">
            <span className="hooray-word">Hooray!</span>
            {Array.from({ length: 18 }, (_, index) => (
              <span className={`confetti c${index + 1}`} key={index} />
            ))}
          </div>
        </>
      ) : null}
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="post-header">
        <UserAvatar
          name={publicName}
          src={post.author_avatar_url}
          anonymous={post.is_anonymous && !isAdmin}
          className={isBirthday ? "post-avatar birthday-avatar" : "post-avatar"}
        />
        <div className="post-meta">
          <div className="post-author">
            {post.author_id ? (
              <a className="author-link" href={`/members/${post.author_id}`}>
                {publicName}
              </a>
            ) : (
              publicName
            )}
            {isBirthday ? (
              <span className="post-tag tag-events">Birthday</span>
            ) : (
              <span className={`post-tag ${categoryClass(post.category)}`}>{post.category}</span>
            )}
          </div>
          <div className="post-time">
            {isBirthday ? "Celebrating today" : <RelativeTime iso={post.created_at} />}
            <EditedLabel at={post.edited_at} isAdmin={isAdmin} onOpen={() => setHistoryOpen(true)} />
            {editWindow.note ? <span className="edit-window-note">{editWindow.note}</span> : null}
          </div>
        </div>
        {isBirthday ? (
          <span className="birthday-badge">
            <IconCake size={14} /> Birthday
          </span>
        ) : null}
        {post.is_anonymous ? <span className="anon-badge">Anonymous</span> : null}
      </div>
      {editing ? (
        <form
          className="edit-box"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData();
            formData.set("id", post.id);
            formData.set("title", editTitle);
            formData.set("body", editBody);
            setError(null);
            startTransition(async () => {
              try {
                await updatePost(formData);
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
        <a href={`/posts/${post.id}`}>
          <h2 className="post-title">{post.title}</h2>
          {birthdayBody ? <p className="post-body">{birthdayBody}</p> : <div className="post-body" />}
        </a>
      )}
      {post.image_url ? <PostImage src={post.image_url} alt="" /> : null}
      <div className="post-footer">
        <button className={`action-btn${liked ? " liked" : ""}`} type="button" onClick={onLike}>
          {liked ? <IconHeartFilled size={15} /> : <IconHeart size={15} />} {likes}
        </button>
        <a className="action-btn" href={`/posts/${post.id}`}>
          <IconMessageCircle size={15} /> {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}
        </a>
        <button className="action-btn" type="button" onClick={() => setReportOpen(true)}>
          <IconFlag size={15} /> Report
        </button>
        {isAdmin && !isBirthday ? (
          <button
            className="action-btn"
            type="button"
            onClick={() =>
              startTransition(async () => {
                try {
                  await togglePin(post.id, !post.is_pinned);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not update pin.");
                }
              })
            }
          >
            <IconPin size={15} /> {post.is_pinned ? "Unpin" : "Pin"}
          </button>
        ) : null}
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
                  await deletePost(post.id);
                  if (window.location.pathname.startsWith("/posts/")) {
                    window.location.href = "/";
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
            <a className="view-more" href={`/posts/${post.id}`}>
              View all {post.comment_count} replies
            </a>
          ) : null}
        </div>
      ) : null}
      {reportOpen ? (
        <ReportModal targetType="post" postId={post.id} onClose={() => setReportOpen(false)} />
      ) : null}
      {historyOpen && post.edited_at ? (
        <EditHistoryModal
          kind="post"
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
