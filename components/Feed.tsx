"use client";

import { useMemo, useState } from "react";
import { IconFlame, IconPin } from "@tabler/icons-react";
import { CATEGORIES } from "@/lib/types";
import type { GroupSummary, PostCardData, Profile } from "@/lib/types";
import { Navbar } from "@/components/Navbar";
import { Composer } from "@/components/Composer";
import { PostCard } from "@/components/PostCard";
import { isBirthdayToday } from "@/lib/birthday";

const FILTERS = ["All", ...CATEGORIES, "Trending"] as const;

export function Feed({
  posts,
  profile,
  groups = [],
}: {
  posts: PostCardData[];
  profile: Profile;
  groups?: GroupSummary[];
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const birthdayToday = useMemo(
    () =>
      posts
        .filter(isBirthdayToday)
        .sort(
          (a, b) =>
            a.author_name.localeCompare(b.author_name, undefined, { sensitivity: "base" }) ||
            a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        ),
    [posts]
  );
  const birthdayIds = useMemo(() => new Set(birthdayToday.map((post) => post.id)), [birthdayToday]);
  const pinned = posts.filter((post) => post.is_pinned && !birthdayIds.has(post.id)).slice(0, 3);
  const showBirthdays = birthdayToday.length > 0 && (filter === "All" || filter === "Events" || filter === "Trending");
  const visible = useMemo(() => {
    let list = posts.filter((post) => !post.is_pinned && !birthdayIds.has(post.id));
    if (filter === "Trending") {
      list = [...list].sort(
        (a, b) => b.likes_last_24h - a.likes_last_24h || b.like_count - a.like_count
      );
    } else if (filter !== "All") {
      list = list.filter((post) => post.category === filter);
    }
    return list;
  }, [posts, filter, birthdayIds]);

  return (
    <>
      <Navbar profile={profile} groups={groups} active="feed" onNewPost={() => setComposerOpen((v) => !v)} />
      <Composer open={composerOpen} />
      <div className="filters">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`filter-btn${filter === item ? " active" : ""}`}
            onClick={() => setFilter(item)}
          >
            {item === "Trending" ? <IconFlame size={13} /> : null}
            {item}
          </button>
        ))}
      </div>
      {showBirthdays ? (
        <>
          <div className="section-label">Celebrating today</div>
          {birthdayToday.map((post) => (
            <PostCard key={post.id} post={post} profile={profile} />
          ))}
        </>
      ) : null}
      {pinned.map((post) => (
        <a className="pinned-banner" href={`/posts/${post.id}`} key={post.id}>
          <IconPin className="pin-icon" size={16} />
          <div>
            <div className="pinned-label">Pinned by admin</div>
            <div className="pinned-title">{post.title}</div>
          </div>
        </a>
      ))}
      <div className="section-label">
        {filter === "Trending" ? "Trending now" : "Recent discussions"}
      </div>
      {visible.length === 0 ? (
        <div className="empty-state">Nothing here yet. Be the first to share something.</div>
      ) : (
        visible.map((post) => <PostCard key={post.id} post={post} profile={profile} />)
      )}
    </>
  );
}
