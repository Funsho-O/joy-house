"use client";

import { useState, useTransition } from "react";
import { IconUser, IconUserOff } from "@tabler/icons-react";
import { CATEGORIES, type Category } from "@/lib/types";
import { createPost } from "@/app/actions/posts";

export function Composer({ open }: { open: boolean }) {
  const [category, setCategory] = useState<Category>("General");
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    formData.set("category", category);
    formData.set("is_anonymous", String(anonymous));
    setError(null);
    startTransition(async () => {
      try {
        await createPost(formData);
        (document.getElementById("postTitle") as HTMLInputElement | null)?.form?.reset();
        setAnonymous(false);
        setCategory("General");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not publish that post.");
      }
    });
  }

  return (
    <form className={`composer${open ? " open" : ""}`} action={onSubmit}>
      <div className="composer-title">Share something with the community</div>
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="form-row">
        <label className="form-label" htmlFor="postTitle">
          Title
        </label>
        <input className="form-input" id="postTitle" name="title" type="text" placeholder="What's on your mind?" required />
      </div>
      <div className="form-row">
        <label className="form-label" htmlFor="postBody">
          Body (optional)
        </label>
        <textarea className="form-input form-textarea" id="postBody" name="body" placeholder="Share more details..." />
      </div>
      <div className="form-row">
        <span className="form-label">Category</span>
        <div className="tag-row">
          {CATEGORIES.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-select${category === tag ? " selected" : ""}`}
              onClick={() => setCategory(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <span className="form-label">Visibility</span>
        <div className="anon-options" role="group" aria-label="Post visibility">
          <button
            type="button"
            className={`anon-option${!anonymous ? " selected" : ""}`}
            aria-pressed={!anonymous}
            onClick={() => setAnonymous(false)}
          >
            <IconUser size={15} />
            Post as yourself
          </button>
          <button
            type="button"
            className={`anon-option${anonymous ? " selected" : ""}`}
            aria-pressed={anonymous}
            onClick={() => setAnonymous(true)}
          >
            <IconUserOff size={15} />
            Anonymous
          </button>
        </div>
        <p className="anon-hint">
          {anonymous
            ? "Your name and photo stay hidden. Shown as Member."
            : "Your display name and photo will appear on this post."}
        </p>
      </div>
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Posting..." : "Post to community"}
      </button>
    </form>
  );
}
