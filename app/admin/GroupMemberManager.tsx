"use client";

import { useMemo, useState, useTransition } from "react";
import { addGroupMember, removeGroupMember } from "@/app/actions/groups";
import { UserAvatar } from "@/components/UserAvatar";
import type { GroupMember, Profile } from "@/lib/types";

export function GroupMemberManager({
  groupId,
  members,
  directory,
}: {
  groupId: string;
  members: GroupMember[];
  directory: Profile[];
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const memberIds = new Set(members.map((member) => member.user_id));

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return directory
      .filter((person) => !memberIds.has(person.id))
      .filter((person) => !term || person.display_name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [directory, memberIds, query]);

  function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setQuery("");
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
      }
    });
  }

  return (
    <>
      {error ? <div className="banner-error">{error}</div> : null}
      <div className="post-card">
        <div className="composer-title">Add a member</div>
        <input
          className="form-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by display name"
        />
        {suggestions.length === 0 ? (
          <p className="anon-hint">{query.trim() ? "No matching members." : "Everyone in the directory is already in this group."}</p>
        ) : (
          <div className="member-list">
            {suggestions.map((person) => (
              <div className="member-row" key={person.id}>
                <UserAvatar name={person.display_name} src={person.avatar_url} className="comment-av" />
                <span className="member-name">{person.display_name}</span>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => addGroupMember(groupId, person.id), "Could not add that member.")}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="section-label">Members ({members.length})</div>
      {members.length === 0 ? (
        <div className="empty-state">No members yet. Add people above.</div>
      ) : (
        members.map((member) => (
          <div className="member-row post-card" key={member.user_id}>
            <UserAvatar name={member.display_name} src={member.avatar_url} className="comment-av" />
            <span className="member-name">
              {member.display_name}
              {member.role === "admin" ? <span className="post-tag tag-events">Admin</span> : null}
            </span>
            <button
              className="action-btn danger ml-auto"
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Remove ${member.display_name} from this group?`)) return;
                run(() => removeGroupMember(groupId, member.user_id), "Could not remove that member.");
              }}
            >
              Remove
            </button>
          </div>
        ))
      )}
    </>
  );
}
