"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { assertCleanText } from "@/lib/profanity";

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

export async function updateDisplayName(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const displayName = String(formData.get("display_name") || "").trim();
  if (!displayName) throw new Error("Display name is required.");
  assertCleanText(displayName);
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", profile.id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/profile");
}

