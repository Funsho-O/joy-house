"use client";

import { useState, useTransition } from "react";
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconTrash,
} from "@tabler/icons-react";
import { deleteGroupPost, toggleGroupLike } from "@/app/actions/groups";
import { relativeTime } from "@/lib/format";
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
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const canDelete = profile.role === "admin" || post.author_id === profile.id;
  const href = `/groups/${post.group_id}/posts/${post.id}`;

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
          <div className="post-author">{post.author_name}</div>
          <div className="post-time">{relativeTime(post.created_at)}</div>
        </div>
      </div>
      <a href={href}>
        <h2 className="post-title">{post.title}</h2>
        {post.body ? <p className="post-body">{post.body}</p> : <div className="post-body" />}
      </a>
      <div className="post-footer">
        <button className={`action-btn${liked ? " liked" : ""}`} type="button" onClick={onLike}>
          {liked ? <IconHeartFilled size={15} /> : <IconHeart size={15} />} {likes}
        </button>
        <a className="action-btn" href={href}>
          <IconMessageCircle size={15} /> {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}
        </a>
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
    </article>
  );
}
