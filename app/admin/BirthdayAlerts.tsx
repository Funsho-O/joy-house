"use client";

import { useState, useTransition } from "react";
import { IconCake } from "@tabler/icons-react";
import { dismissBirthdayAlert, runBirthdayCelebrations } from "@/app/actions/account";
import { UserAvatar } from "@/components/UserAvatar";
import type { BirthdayAlert } from "@/lib/types";

export function BirthdayAlerts({ alerts }: { alerts: BirthdayAlert[] }) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="birthday-admin">
      <div className="admin-tabs">
        <span className="section-label">Private birthdays</span>
        <button
          className="btn-secondary"
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setInfo(null);
            startTransition(async () => {
              try {
                await runBirthdayCelebrations();
                setInfo("Checked today’s birthdays.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not run birthday check.");
              }
            });
          }}
        >
          Check today
        </button>
      </div>
      <p className="auth-sub">
        Members who kept their birthday private. Public celebrations appear on the feed automatically.
      </p>
      {error ? <div className="banner-error">{error}</div> : null}
      {info ? <div className="banner-ok">{info}</div> : null}
      {alerts.length === 0 ? (
        <div className="empty-state">No private birthday alerts.</div>
      ) : (
        alerts.map((alert) => (
          <div className="member-row post-card" key={alert.id}>
            <UserAvatar name={alert.display_name} src={alert.avatar_url} className="comment-av" />
            <div className="activity-member">
              <div className="member-name">
                <IconCake size={16} />
                {alert.display_name}
                <span className="post-tag tag-events">Private</span>
              </div>
              <div className="activity-counts">Birthday in {alert.year} — no public post was made.</div>
            </div>
            <button
              className="action-btn"
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await dismissBirthdayAlert(alert.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not dismiss.");
                  }
                });
              }}
            >
              Dismiss
            </button>
          </div>
        ))
      )}
    </div>
  );
}
