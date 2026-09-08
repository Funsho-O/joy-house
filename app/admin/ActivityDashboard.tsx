"use client";

import { IconDownload } from "@tabler/icons-react";
import { UserAvatar } from "@/components/UserAvatar";
import { RelativeTime } from "@/components/RelativeTime";
import type { AdminMemberActivity, WeeklyEngagement } from "@/lib/types";

function csvValue(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatStamp(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function weekLabel(iso: string) {
  const date = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function downloadCsv(members: AdminMemberActivity[]) {
  const header = [
    "Name",
    "Posts",
    "Comments",
    "Likes received",
    "Last post",
    "Last active",
    "Member since",
    "Follow-up",
  ];
  const lines = [
    header.join(","),
    ...members.map((member) =>
      [
        csvValue(member.display_name),
        member.post_count,
        member.comment_count,
        member.like_count,
        formatStamp(member.last_post_at),
        formatStamp(member.last_active_at),
        formatStamp(member.member_since),
        member.needs_follow_up ? "Yes" : "No",
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `joy-house-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ActivityDashboard({
  members,
  weeks,
}: {
  members: AdminMemberActivity[];
  weeks: WeeklyEngagement[];
}) {
  const followUps = members.filter((member) => member.needs_follow_up);
  const totals = members.reduce(
    (acc, member) => {
      acc.posts += member.post_count;
      acc.comments += member.comment_count;
      acc.likes += member.like_count;
      return acc;
    },
    { posts: 0, comments: 0, likes: 0 }
  );
  const maxWeek = Math.max(
    1,
    ...weeks.map((week) => week.post_count + week.comment_count + week.like_count)
  );

  return (
    <>
      <div className="activity-summary">
        <div className="activity-stat">
          <strong>{totals.posts}</strong>
          <span>Posts</span>
        </div>
        <div className="activity-stat">
          <strong>{totals.comments}</strong>
          <span>Comments</span>
        </div>
        <div className="activity-stat">
          <strong>{totals.likes}</strong>
          <span>Likes</span>
        </div>
        <div className="activity-stat follow-up">
          <strong>{followUps.length}</strong>
          <span>Need follow-up</span>
        </div>
      </div>

      <div className="section-label">Weekly engagement</div>
      <div className="activity-chart-card post-card">
        <div className="activity-chart-legend">
          <span>
            <i className="swatch posts" /> Posts
          </span>
          <span>
            <i className="swatch comments" /> Comments
          </span>
          <span>
            <i className="swatch likes" /> Likes
          </span>
        </div>
        <div className="activity-chart">
          {weeks.map((week) => {
            const total = week.post_count + week.comment_count + week.like_count;
            const height = Math.max(4, Math.round((total / maxWeek) * 120));
            const postsH = total ? Math.round((week.post_count / total) * height) : 0;
            const commentsH = total ? Math.round((week.comment_count / total) * height) : 0;
            const likesH = Math.max(0, height - postsH - commentsH);
            return (
              <div className="activity-bar-col" key={week.week_start} title={`${weekLabel(week.week_start)}: ${total}`}>
                <div className="activity-bar-stack" style={{ height: `${height}px` }}>
                  <span className="bar-seg likes" style={{ height: `${likesH}px` }} />
                  <span className="bar-seg comments" style={{ height: `${commentsH}px` }} />
                  <span className="bar-seg posts" style={{ height: `${postsH}px` }} />
                </div>
                <span className="activity-bar-label">{weekLabel(week.week_start)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {followUps.length > 0 ? (
        <>
          <div className="section-label">Pastoral follow-up</div>
          <p className="auth-sub">Members who have not posted in over two weeks.</p>
          {followUps.map((member) => (
            <a className="member-row post-card follow-up-row" href={`/members/${member.user_id}`} key={member.user_id}>
              <UserAvatar name={member.display_name} src={member.avatar_url} className="comment-av" />
              <div className="member-name">
                {member.display_name}
                <span className="post-tag tag-events">Follow-up</span>
              </div>
              <span className="activity-quiet">
                {member.last_post_at ? (
                  <>
                    Last post <RelativeTime iso={member.last_post_at} />
                  </>
                ) : (
                  "Never posted"
                )}
              </span>
            </a>
          ))}
        </>
      ) : null}

      <div className="admin-tabs">
        <span className="section-label">Members</span>
        <button className="btn-secondary" type="button" onClick={() => downloadCsv(members)}>
          <IconDownload size={16} /> Export CSV
        </button>
      </div>
      {members.map((member) => (
        <a className="member-row post-card" href={`/members/${member.user_id}`} key={member.user_id}>
          <UserAvatar name={member.display_name} src={member.avatar_url} className="comment-av" />
          <div className="activity-member">
            <div className="member-name">
              {member.display_name}
              {member.needs_follow_up ? <span className="post-tag tag-events">Follow-up</span> : null}
            </div>
            <div className="activity-counts">
              {member.post_count} posts · {member.comment_count} comments · {member.like_count} likes
            </div>
          </div>
          <span className="activity-quiet">
            {member.last_active_at ? (
              <>
                Active <RelativeTime iso={member.last_active_at} />
              </>
            ) : (
              "No activity yet"
            )}
          </span>
        </a>
      ))}
    </>
  );
}
