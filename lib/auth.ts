import { createClient } from "@/lib/supabase/server";
import type { GroupSummary, Profile } from "@/lib/types";

export async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null, isAdmin: false, groups: [] as GroupSummary[] };

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role, push_enabled")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const retry = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = retry.data ? { ...retry.data, push_enabled: true } : null;
  } else if (profile && profile.push_enabled == null) {
    profile = { ...profile, push_enabled: true };
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
    profile: (profile as Profile | null) ?? null,
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
