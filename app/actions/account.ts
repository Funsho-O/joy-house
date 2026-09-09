"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { assertCleanText } from "@/lib/profanity";
import { revalidateActivity } from "@/lib/activity";
import { buildDateOfBirth } from "@/lib/birthday";

export async function createReport(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const targetType = String(formData.get("target_type") || "");
  const postId = String(formData.get("post_id") || "") || null;
  const commentId = String(formData.get("comment_id") || "") || null;
  const reason = String(formData.get("reason") || "").trim();

  if (targetType !== "post" && targetType !== "comment") {
    throw new Error("Invalid report.");
  }
  if (!reason) throw new Error("Please add a reason.");
  assertCleanText(reason);

  const { error } = await supabase.from("reports").insert({
    target_type: targetType,
    post_id: postId,
    comment_id: targetType === "comment" ? commentId : null,
    reported_by: profile.id,
    reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function resolveReport(reportId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("reports").update({ resolved: true }).eq("id", reportId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function updateProfile(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const displayName = String(formData.get("display_name") || "").trim();
  if (!displayName) throw new Error("Display name is required.");
  assertCleanText(displayName);

  const dateOfBirth = buildDateOfBirth(
    String(formData.get("birth_month") || ""),
    String(formData.get("birth_day") || ""),
    String(formData.get("birth_year") || "")
  );

  const celebrate = String(formData.get("celebrate_birthday") || "") === "true";
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      date_of_birth: dateOfBirth,
      celebrate_birthday: celebrate,
    })
    .eq("id", profile.id);
  if (error) {
    if (/date_of_birth|celebrate_birthday|schema cache/i.test(error.message)) {
      throw new Error("Birthday settings are not set up yet. In Supabase, run supabase/birthdays.sql.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/profile");
  revalidateActivity(profile.id);
  redirect("/profile?saved=1");
}

export async function updateDisplayName(formData: FormData) {
  return updateProfile(formData);
}

export async function setMemberRole(userId: string, role: "member" | "admin") {
  const { supabase } = await requireAdmin();
  if (!userId || (role !== "member" && role !== "admin")) {
    throw new Error("Choose a valid role.");
  }

  if (role === "member") {
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("role, deactivated_at")
      .eq("id", userId)
      .maybeSingle();
    if (targetError) {
      if (/deactivated_at|schema cache/i.test(targetError.message)) {
        const retry = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
        if (retry.error) throw new Error(retry.error.message);
        if (retry.data?.role === "admin") {
          const { count, error: countError } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "admin");
          if (countError) throw new Error(countError.message);
          if ((count || 0) <= 1) throw new Error("There must be at least one admin.");
        }
      } else {
        throw new Error(targetError.message);
      }
    } else {
      if (target?.deactivated_at) throw new Error("That account is deactivated.");
      if (target?.role === "admin") {
        const { count, error: countError } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .is("deactivated_at", null);
        if (countError) throw new Error(countError.message);
        if ((count || 0) <= 1) {
          throw new Error("There must be at least one admin.");
        }
      }
    }
  }

  if (role === "admin") {
    const { data: target } = await supabase
      .from("profiles")
      .select("deactivated_at")
      .eq("id", userId)
      .maybeSingle();
    if (target?.deactivated_at) throw new Error("That account is deactivated.");
  }

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/members");
  revalidatePath("/profile");
}

export async function dismissBirthdayAlert(alertId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("birthday_alerts").delete().eq("id", alertId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function runBirthdayCelebrations() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("run_birthday_celebrations");
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      throw new Error("Birthday celebrations are not set up yet. In Supabase, run supabase/birthdays.sql.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return data;
}

export async function deactivateAccount(userId: string) {
  const { supabase, profile, isAdmin } = await requireVerifiedUser();
  if (!userId) throw new Error("Choose a member.");
  if (userId !== profile.id && !isAdmin) {
    throw new Error("Not allowed.");
  }

  const { error } = await supabase.rpc("deactivate_account", { target_id: userId });
  if (error) {
    if (/function .* does not exist/i.test(error.message) || /schema cache/i.test(error.message)) {
      throw new Error("Account deactivation is not set up yet. In Supabase, run supabase/soft-delete-accounts.sql.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/admin");
  revalidatePath("/admin/members");
  revalidateActivity(userId);

  if (userId === profile.id) {
    await supabase.auth.signOut();
    redirect("/login?deactivated=1");
  }
}


