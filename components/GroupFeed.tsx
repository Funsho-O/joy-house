"use client";

import { useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { GroupComposer } from "@/components/GroupComposer";
import { GroupPostCard } from "@/components/GroupPostCard";
import type { Group, GroupPostData, GroupSummary, Profile } from "@/lib/types";

export function GroupFeed({
  group,
  posts,
  profile,
  groups,
}: {
  group: Group;
  posts: GroupPostData[];
  profile: Profile;
  groups: GroupSummary[];
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const list = useMemo(() => posts, [posts]);

  return (
    <>
      <Navbar profile={profile} groups={groups} onNewPost={() => setComposerOpen((v) => !v)} />
      <div className="group-heading">
        <div className="section-label">Group</div>
        <h1 className="auth-title">{group.name}</h1>
        {group.description ? <p className="auth-sub">{group.description}</p> : null}
      </div>
      <GroupComposer groupId={group.id} open={composerOpen} />
      <div className="section-label">Recent discussions</div>
      {list.length === 0 ? (
        <div className="empty-state">Nothing here yet. Be the first to share something.</div>
      ) : (
        list.map((post) => <GroupPostCard key={post.id} post={post} profile={profile} />)
      )}
    </>
  );
}
