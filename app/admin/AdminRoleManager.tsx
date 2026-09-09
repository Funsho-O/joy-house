"use client";

import { useMemo, useState, useTransition } from "react";
import { setMemberRole } from "@/app/actions/account";
import { UserAvatar } from "@/components/UserAvatar";
import { DeactivateAccountButton } from "@/components/DeactivateAccountButton";
import type { Profile } from "@/lib/types";

export function AdminRoleManager({ people }: { people: Profile[] }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return people.filter((person) => !term || person.display_name.toLowerCase().includes(term));
  }, [people, query]);

  function assign(userId: string, role: "member" | "admin", name: string) {
    const next = role === "admin" ? `Make ${name} an admin?` : `Remove admin access from ${name}?`;
    if (!confirm(next)) return;
    setError(null);
    startTransition(async () => {
      try {
        await setMemberRole(userId, role);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update that role.");
      }
    });
  }

  return (
    <>
      {error ? <div className="banner-error">{error}</div> : null}
      <input
        className="form-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search members"
      />
      {visible.length === 0 ? (
        <div className="empty-state">No matching members.</div>
      ) : (
        visible.map((person) => (
          <div className="member-row post-card" key={person.id}>
            <UserAvatar name={person.display_name} src={person.avatar_url} className="comment-av" />
            <div className="member-name">
              {person.display_name}
              {person.role === "admin" ? <span className="post-tag tag-events">Admin</span> : null}
            </div>
            {person.role === "admin" ? (
              <button
                className="action-btn danger"
                type="button"
                disabled={pending}
                onClick={() => assign(person.id, "member", person.display_name)}
              >
                Remove admin
              </button>
            ) : (
              <button
                className="btn-secondary"
                type="button"
                disabled={pending}
                onClick={() => assign(person.id, "admin", person.display_name)}
              >
                Make admin
              </button>
            )}
            <DeactivateAccountButton userId={person.id} name={person.display_name} />
          </div>
        ))
      )}
    </>
  );
}
