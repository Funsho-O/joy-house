"use client";

import { useState, useTransition } from "react";
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
      <div className="anon-row">
        <button
          type="button"
          className={`toggle${anonymous ? " on" : ""}`}
          role="switch"
          aria-checked={anonymous}
          onClick={() => setAnonymous((v) => !v)}
        >
          <span className="toggle-knob" />
        </button>
        <span className="anon-label">{anonymous ? "Post anonymously" : "Post as yourself"}</span>
      </div>
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Posting..." : "Post to community"}
      </button>
    </form>
  );
}
