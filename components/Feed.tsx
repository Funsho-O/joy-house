"use client";

import { useMemo, useState } from "react";
import { IconFlame, IconPin } from "@tabler/icons-react";
import { CATEGORIES } from "@/lib/types";
import type { GroupSummary, PostCardData, Profile } from "@/lib/types";
import { Navbar } from "@/components/Navbar";
import { Composer } from "@/components/Composer";
import { PostCard } from "@/components/PostCard";

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

  const pinned = posts.filter((post) => post.is_pinned).slice(0, 3);
  const visible = useMemo(() => {
    let list = posts.filter((post) => !post.is_pinned);
    if (filter === "Trending") {
      list = [...list].sort(
        (a, b) => b.likes_last_24h - a.likes_last_24h || b.like_count - a.like_count
      );
    } else if (filter !== "All") {
      list = list.filter((post) => post.category === filter);
    }
    return list;
  }, [posts, filter]);

  return (
    <>
      <Navbar profile={profile} groups={groups} active="feed" onNewPost={() => setComposerOpen((v) => !v)} />
      <Composer open={composerOpen} />
      {pinned.map((post) => (
        <a className="pinned-banner" href={`/posts/${post.id}`} key={post.id}>
          <IconPin className="pin-icon" size={16} />
          <div>
            <div className="pinned-label">Pinned by admin</div>
            <div className="pinned-title">{post.title}</div>
          </div>
        </a>
      ))}
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
