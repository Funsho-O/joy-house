"use client";

import { useRef, useState, useTransition } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function AvatarEditor({
  profile,
  saveAvatarUrl,
  removeAvatar,
}: {
  profile: Profile;
  saveAvatarUrl: (publicUrl: string) => Promise<void>;
  removeAvatar: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const ext = AVATAR_TYPES[file.type];
        if (!ext) throw new Error("Use a JPG, PNG, WebP, or GIF.");
        if (file.size > 2 * 1024 * 1024) throw new Error("Photo must be under 2MB.");

        const supabase = createClient();
        const { data: existing } = await supabase.storage.from("avatars").list(profile.id);
        if (existing?.length) {
          const { error: removeError } = await supabase.storage
            .from("avatars")
            .remove(existing.map((item) => `${profile.id}/${item.name}`));
          if (removeError) throw new Error(removeError.message);
        }

        const path = `${profile.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });
        if (uploadError) throw new Error(uploadError.message);

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        await saveAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that photo.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="form-row">
      <p className="form-label">Profile photo</p>
      <p className="auth-sub avatar-hint">
        Optional. Shown on your posts and comments. Hidden when you post anonymously.
      </p>
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="avatar-editor">
        <UserAvatar name={profile.display_name} src={profile.avatar_url} className="profile-avatar" />
        <div className="avatar-editor-actions">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => onPick(event.target.files?.[0])}
          />
          <button
            className="btn-secondary"
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "Saving..." : profile.avatar_url ? "Change photo" : "Add photo"}
          </button>
          {profile.avatar_url ? (
            <button
              className="btn-secondary"
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await removeAvatar();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not remove that photo.");
                  }
                });
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
