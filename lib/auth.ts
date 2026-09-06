import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    profile: (profile as Profile | null) ?? null,
    isAdmin: profile?.role === "admin",
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
