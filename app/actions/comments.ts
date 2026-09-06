"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { assertCleanText } from "@/lib/profanity";

export async function createComment(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const postId = String(formData.get("post_id") || "");
  const parentId = String(formData.get("parent_id") || "") || null;
  const body = String(formData.get("body") || "").trim();
  if (!postId || !body) throw new Error("Write a comment first.");
  assertCleanText(body);

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    parent_id: parentId,
    body,
    author_id: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
}

export async function deleteComment(commentId: string, postId: string) {
  const { supabase, profile, isAdmin } = await requireVerifiedUser();
  let query = supabase.from("comments").delete().eq("id", commentId);
  if (!isAdmin) query = query.eq("author_id", profile.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/admin");
}
