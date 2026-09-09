"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconHome, IconPlus, IconTrophy, IconUsers } from "@tabler/icons-react";
import { signOut } from "@/app/actions/auth";
import { initials } from "@/lib/format";
import { Logo } from "@/components/Brand";
import { NotificationBell } from "@/components/NotificationBell";
import type { GroupSummary, Profile } from "@/lib/types";

export function Navbar({
  profile,
  groups = [],
  onNewPost,
  active,
}: {
  profile: Profile;
  groups?: GroupSummary[];
  onNewPost?: () => void;
  active?: "feed" | "groups" | "leaderboard";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const showGroups = groups.length > 0;

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
      <div className="nav-right">
        <a className={`nav-link-btn${active === "feed" ? " active" : ""}`} href="/">
          <IconHome size={16} /> <span>Feed</span>
        </a>
        <a className={`nav-link-btn${active === "leaderboard" ? " active" : ""}`} href="/leaderboard">
          <IconTrophy size={16} /> <span>Leaderboard</span>
        </a>
        {showGroups ? (
          <a className={`nav-link-btn${active === "groups" ? " active" : ""}`} href="/groups">
            <IconUsers size={16} /> <span>Groups</span>
          </a>
        ) : null}
        {onNewPost ? (
          <button className="new-post-btn" type="button" onClick={onNewPost}>
            <IconPlus size={16} /> <span>New post</span>
          </button>
        ) : null}
        <NotificationBell />
        <div className="nav-account" ref={menuRef}>
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
            <a href="/">Feed</a>
            <a href="/leaderboard">Leaderboard</a>
            {showGroups ? <a href="/groups">Groups</a> : null}
            <a href="/profile">Profile</a>
            {profile.role === "admin" ? <a href="/admin">Admin queue</a> : null}
            {profile.role === "admin" ? <a href="/admin/activity">Activity dashboard</a> : null}
            {profile.role === "admin" ? <a href="/admin/groups">Manage groups</a> : null}
            {profile.role === "admin" ? <a href="/admin/members">Assign admins</a> : null}
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
    </div>
  );
}
