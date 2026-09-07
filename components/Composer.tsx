"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconPhoto, IconUser, IconUserOff, IconX } from "@tabler/icons-react";
import { CATEGORIES, type Category } from "@/lib/types";
import { createPost } from "@/app/actions/posts";
import { createClient } from "@/lib/supabase/client";
import {
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TOO_LARGE,
  POST_IMAGE_TYPES,
  postImageSetupMessage,
} from "@/lib/post-image";

export function Composer({ open }: { open: boolean }) {
  const [category, setCategory] = useState<Category>("General");
  const [anonymous, setAnonymous] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearImage() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPick(picked: File | undefined) {
    if (!picked) return;
    if (picked.size > POST_IMAGE_MAX_BYTES) {
      setError(POST_IMAGE_TOO_LARGE);
      clearImage();
      return;
    }
    if (!POST_IMAGE_TYPES[picked.type]) {
      setError("Use a JPG, PNG, WebP, or GIF.");
      clearImage();
      return;
    }
    setError(null);
    setFile(picked);
  }

  async function uploadImage(image: File) {
    const ext = POST_IMAGE_TYPES[image.type];
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Please sign in to attach a photo.");

    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("post-images").upload(path, image, {
      contentType: image.type,
      cacheControl: "3600",
    });
    if (uploadError) throw new Error(postImageSetupMessage(uploadError.message));
    return supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
  }

  function resetComposer() {
    (document.getElementById("postTitle") as HTMLInputElement | null)?.form?.reset();
    setAnonymous(false);
    setCategory("General");
    clearImage();
  }

  function onSubmit(formData: FormData) {
    formData.set("category", category);
    formData.set("is_anonymous", String(anonymous));
    setError(null);
    startTransition(async () => {
      try {
        if (file) {
          if (file.size > POST_IMAGE_MAX_BYTES) throw new Error(POST_IMAGE_TOO_LARGE);
          formData.set("image_url", await uploadImage(file));
        }
        await createPost(formData);
        resetComposer();
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
        <span className="form-label">Photo (optional)</span>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => onPick(event.target.files?.[0])}
        />
        {preview ? (
          <div className="composer-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" />
            <button className="composer-image-remove" type="button" onClick={clearImage} aria-label="Remove photo">
              <IconX size={14} />
            </button>
          </div>
        ) : (
          <button className="composer-attach" type="button" onClick={() => inputRef.current?.click()}>
            <IconPhoto size={16} /> Add a photo
          </button>
        )}
        <p className="anon-hint">One image, up to 5MB.</p>
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
