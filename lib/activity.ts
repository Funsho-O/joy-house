import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminMemberActivity,
  BadgeAward,
  BadgeId,
  LeaderboardEntry,
  Profile,
  WeeklyEngagement,
} from "@/lib/types";

export function activitySetupMessage(message: string) {
  if (/schema cache|does not exist|community_scores|admin_member_activity|admin_weekly_engagement|badge_awards/i.test(message)) {
    return "Activity tracking is not set up yet. In Supabase, run supabase/activity.sql.";
  }
  return message;
}

export function revalidateActivity(userId?: string) {
  revalidatePath("/leaderboard");
  revalidatePath("/admin/activity");
  revalidatePath("/profile");
  if (userId) revalidatePath(`/members/${userId}`);
}

function asCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type AdminActivityRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  post_count: unknown;
  comment_count: unknown;
  like_count: unknown;
  last_post_at: string | null;
  last_active_at: string | null;
  member_since: string;
  needs_follow_up: boolean;
};

type WeeklyEngagementRow = {
  week_start: string;
  post_count: unknown;
  comment_count: unknown;
  like_count: unknown;
};

function mapScore(row: {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  post_count: unknown;
  comment_count: unknown;
  like_count: unknown;
  score: unknown;
}): LeaderboardEntry {
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    post_count: asCount(row.post_count),
    comment_count: asCount(row.comment_count),
    like_count: asCount(row.like_count),
    score: asCount(row.score),
  };
}

export async function fetchLeaderboard(period: "week" | "all"): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("community_scores", { p_period: period });
  if (error) throw new Error(activitySetupMessage(error.message));
  return ((data || []) as Parameters<typeof mapScore>[0][]).map(mapScore);
}

export async function fetchBadgeAwards(userId: string): Promise<BadgeAward[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("badge_awards")
    .select("badge_id, earned_at")
    .eq("user_id", userId);
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(activitySetupMessage(error.message));
  }
  return (data || []).map((row) => ({
    id: row.badge_id as BadgeId,
    earned_at: row.earned_at as string,
  }));
}

export async function fetchMemberProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role, push_enabled, deactivated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (/deactivated_at|schema cache/i.test(error.message)) {
      const retry = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, role, push_enabled")
        .eq("id", userId)
        .maybeSingle();
      if (retry.error) throw new Error(retry.error.message);
      if (!retry.data) return null;
      return {
        ...retry.data,
        push_enabled: retry.data.push_enabled ?? true,
        date_of_birth: null,
        celebrate_birthday: false,
        deactivated_at: null,
      } as Profile;
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    ...data,
    push_enabled: data.push_enabled ?? true,
    date_of_birth: null,
    celebrate_birthday: false,
    deactivated_at: data.deactivated_at || null,
  } as Profile;
}

export async function fetchAdminMemberActivity(): Promise<AdminMemberActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_member_activity");
  if (error) throw new Error(activitySetupMessage(error.message));
  return ((data || []) as AdminActivityRow[]).map((row: AdminActivityRow) => ({
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    post_count: asCount(row.post_count),
    comment_count: asCount(row.comment_count),
    like_count: asCount(row.like_count),
    last_post_at: row.last_post_at || null,
    last_active_at: row.last_active_at || null,
    member_since: row.member_since,
    needs_follow_up: Boolean(row.needs_follow_up),
  }));
}

export async function fetchWeeklyEngagement(): Promise<WeeklyEngagement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_weekly_engagement");
  if (error) throw new Error(activitySetupMessage(error.message));
  return ((data || []) as WeeklyEngagementRow[]).map((row: WeeklyEngagementRow) => ({
    week_start: String(row.week_start),
    post_count: asCount(row.post_count),
    comment_count: asCount(row.comment_count),
    like_count: asCount(row.like_count),
  }));
}
