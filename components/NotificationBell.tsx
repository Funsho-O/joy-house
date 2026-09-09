"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconBell } from "@tabler/icons-react";
import {
  fetchUnreadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";
import { RelativeTime } from "@/components/RelativeTime";
import { UserAvatar } from "@/components/UserAvatar";
import type { AppNotification } from "@/lib/types";

function actionLabel(item: AppNotification) {
  if (item.kind === "post_like") return "liked your post";
  if (item.kind === "comment_reply") return "replied to your comment";
  return "replied to your post";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  function refresh() {
    startTransition(async () => {
      try {
        setItems(await fetchUnreadNotifications());
      } catch {
        setItems([]);
      }
    });
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const count = items.length;
  const badge = count > 9 ? "9+" : String(count);

  function openMenu() {
    setOpen((value) => !value);
    refresh();
  }

  function openItem(item: AppNotification) {
    startTransition(async () => {
      try {
        await markNotificationRead(item.id);
        setItems((current) => current.filter((row) => row.id !== item.id));
      } catch {
        // Navigation still helps even if the mark-read update failed.
      }
      window.location.href = `/posts/${item.post_id}`;
    });
  }

  function markAll() {
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
        setItems([]);
      } catch {
        // Keep the list if the update failed.
      }
    });
  }

  return (
    <div className="notif-root" ref={rootRef}>
      <button
        className={`notif-bell${open ? " open" : ""}`}
        type="button"
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={openMenu}
      >
        <IconBell size={16} />
        {count > 0 ? <span className="notif-badge">{badge}</span> : null}
      </button>
      {open ? (
        <div className="notif-menu" role="menu" aria-label="Unread notifications">
          <div className="notif-menu-head">
            <span>Notifications</span>
            {count > 0 ? (
              <button type="button" disabled={pending} onClick={markAll}>
                Mark all read
              </button>
            ) : null}
          </div>
          {count === 0 ? (
            <p className="notif-empty">No unread notifications.</p>
          ) : (
            items.map((item) => (
              <button
                className="notif-item"
                type="button"
                key={item.id}
                role="menuitem"
                disabled={pending}
                onClick={() => openItem(item)}
              >
                <UserAvatar name={item.actor_name} src={item.actor_avatar_url} className="comment-av" />
                <span className="notif-copy">
                  <span className="notif-line">
                    <strong>{item.actor_name}</strong> {actionLabel(item)}
                  </span>
                  <span className="notif-title">{item.post_title}</span>
                  <span className="notif-time">
                    <RelativeTime iso={item.created_at} />
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
