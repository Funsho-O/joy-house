"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconPlus } from "@tabler/icons-react";
import { signOut } from "@/app/actions/auth";
import { initials } from "@/lib/format";
import { Logo } from "@/components/Brand";
import type { Profile } from "@/lib/types";

export function Navbar({
  profile,
  onNewPost,
}: {
  profile: Profile;
  onNewPost?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="topbar">
      <Logo />
      <div className="nav-right" ref={menuRef}>
        {onNewPost ? (
          <button className="new-post-btn" type="button" onClick={onNewPost}>
            <IconPlus size={16} /> <span>New post</span>
          </button>
        ) : null}
        <button
          className={`avatar${profile.avatar_url ? " has-photo" : ""}`}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Account menu"
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" />
          ) : (
            initials(profile.display_name)
          )}
        </button>
        {open ? (
          <div className="user-menu">
            <a href="/profile">Profile</a>
            {profile.role === "admin" ? <a href="/admin">Admin queue</a> : null}
            <button
              type="button"
              className="danger"
              disabled={pending}
              onClick={() => startTransition(() => signOut())}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
