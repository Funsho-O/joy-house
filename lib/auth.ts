import { createClient } from "@/lib/supabase/server";
import type { GroupSummary, Profile } from "@/lib/types";

function withProfileDefaults(row: {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  role: Profile["role"];
  push_enabled?: boolean | null;
  date_of_birth?: string | null;
  celebrate_birthday?: boolean | null;
}): Profile {
  return {
    id: row.id,
    display_name: row.display_name,
    avatar_url: row.avatar_url || null,
    role: row.role,
    push_enabled: row.push_enabled ?? true,
    date_of_birth: row.date_of_birth || null,
    celebrate_birthday: Boolean(row.celebrate_birthday),
  };
}

export async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null, isAdmin: false, groups: [] as GroupSummary[] };

  let profile: Profile | null = null;
  const full = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role, push_enabled, date_of_birth, celebrate_birthday")
    .eq("id", user.id)
    .maybeSingle();

  if (!full.error && full.data) {
    profile = withProfileDefaults(full.data);
  } else {
    const retry = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, role, push_enabled")
      .eq("id", user.id)
      .maybeSingle();
    if (!retry.error && retry.data) {
      profile = withProfileDefaults(retry.data);
    } else {
      const basic = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, role")
        .eq("id", user.id)
        .maybeSingle();
      profile = basic.data ? withProfileDefaults(basic.data) : null;
    }
  }

  let groups: GroupSummary[] = [];
  if (profile) {
    const { data: memberships, error } = await supabase
      .from("group_members")
      .select("groups(id, name)")
      .eq("user_id", user.id);
    if (!error && memberships) {
      groups = memberships
        .map((row) => {
          const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
          return group ? { id: group.id as string, name: group.name as string } : null;
        })
        .filter((group): group is GroupSummary => Boolean(group))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return {
    supabase,
    user,
    profile,
    isAdmin: profile?.role === "admin",
    groups,
  };
}

export async function requireVerifiedUser() {
  const ctx = await getAuthContext();
  if (!ctx.user || !ctx.user.email_confirmed_at) {
    throw new Error("You must be a verified member to do that.");
  }
  if (!ctx.profile) {
    throw new Error("Profile not found.");
  }
  return ctx as typeof ctx & { user: NonNullable<typeof ctx.user>; profile: Profile };
}

export async function requireAdmin() {
  const ctx = await requireVerifiedUser();
  if (!ctx.isAdmin) {
    throw new Error("Admin access required.");
  }
  return ctx;
}
