"use server";

import { requireVerifiedUser } from "@/lib/auth";
import type { AppNotification, NotificationKind } from "@/lib/types";

type NotificationRow = {
  id: string;
  kind: string;
  post_id: string;
  created_at: string;
  actor: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;
  posts: { title: string } | { title: string }[] | null;
};

function setupMessage(message: string) {
  if (/schema cache|does not exist/i.test(message)) {
    return "Notifications are not set up yet. In Supabase, run supabase/notifications.sql.";
  }
  return message;
}

function asKind(value: string): NotificationKind {
  if (value === "post_reply" || value === "comment_reply" || value === "post_like") return value;
  return "post_reply";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function hydrate(row: NotificationRow): AppNotification {
  const actor = one(row.actor);
  const post = one(row.posts);
  return {
    id: row.id,
    kind: asKind(row.kind),
    post_id: row.post_id,
    post_title: post?.title || "a post",
    actor_name: actor?.display_name || "Member",
    actor_avatar_url: actor?.avatar_url || null,
    created_at: row.created_at,
  };
}

export async function fetchUnreadNotifications(): Promise<AppNotification[]> {
  const { supabase, profile } = await requireVerifiedUser();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, post_id, created_at, actor:profiles!actor_id(display_name, avatar_url), posts(title)")
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(setupMessage(error.message));
  }
  return ((data || []) as NotificationRow[]).map(hydrate);
}

export async function markNotificationRead(id: string) {
  const { supabase, profile } = await requireVerifiedUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", profile.id)
    .is("read_at", null);
  if (error) throw new Error(setupMessage(error.message));
}

export async function markAllNotificationsRead() {
  const { supabase, profile } = await requireVerifiedUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .is("read_at", null);
  if (error) throw new Error(setupMessage(error.message));
}
