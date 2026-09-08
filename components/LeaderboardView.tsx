"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import type { LeaderboardEntry, Profile } from "@/lib/types";

function medalClass(rank: number) {
  if (rank === 1) return " gold";
  if (rank === 2) return " silver";
  if (rank === 3) return " bronze";
  return "";
}

function Board({
  rows,
  viewerId,
}: {
  rows: LeaderboardEntry[];
  viewerId: string;
}) {
  if (rows.length === 0) {
    return <div className="empty-state">No activity here yet. Share something on the feed to get on the board.</div>;
  }

  return (
    <div className="leaderboard-list">
      {rows.map((row, index) => {
        const rank = index + 1;
        return (
          <a
            className={`leaderboard-row${medalClass(rank)}`}
            href={`/members/${row.user_id}`}
            key={row.user_id}
          >
            <span className="leaderboard-rank">{rank}</span>
            <UserAvatar name={row.display_name} src={row.avatar_url} className="comment-av" />
            <div className="leaderboard-name">
              {row.display_name}
              {row.user_id === viewerId ? <span className="post-tag tag-general">You</span> : null}
            </div>
            <div className="leaderboard-score">
              <strong>{row.score}</strong>
              <span>
                {row.post_count} post{row.post_count === 1 ? "" : "s"} · {row.comment_count} comment
                {row.comment_count === 1 ? "" : "s"} · {row.like_count} like{row.like_count === 1 ? "" : "s"}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function LeaderboardView({
  week,
  allTime,
  profile,
}: {
  week: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
  profile: Profile;
}) {
  const [period, setPeriod] = useState<"week" | "all">("week");

  return (
    <>
      <div className="filters">
        <button
          type="button"
          className={`filter-btn${period === "week" ? " active" : ""}`}
          onClick={() => setPeriod("week")}
        >
          This Week
        </button>
        <button
          type="button"
          className={`filter-btn${period === "all" ? " active" : ""}`}
          onClick={() => setPeriod("all")}
        >
          All Time
        </button>
      </div>
      <div className="section-label">{period === "week" ? "This week" : "All time"}</div>
      <Board rows={period === "week" ? week : allTime} viewerId={profile.id} />
    </>
  );
}
