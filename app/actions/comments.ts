"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { assertCleanText } from "@/lib/profanity";
import { notifyReply } from "@/lib/push";
import { assertEditable } from "@/lib/edit-window";
import { revalidateActivity } from "@/lib/activity";

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

  try {
    if (parentId) {
      const { data: parent } = await supabase.from("comments").select("author_id").eq("id", parentId).maybeSingle();
      if (parent?.author_id) {
        await notifyReply({
          supabase,
          recipientId: parent.author_id,
          actorId: profile.id,
          actorName: profile.display_name,
          url: `/posts/${postId}`,
          kind: "comment",
          commentBody: body,
        });
      }
    } else {
      const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).maybeSingle();
      if (post?.author_id) {
        await notifyReply({
          supabase,
          recipientId: post.author_id,
          actorId: profile.id,
          actorName: profile.display_name,
          url: `/posts/${postId}`,
          kind: "post",
          commentBody: body,
        });
      }
    }
  } catch {
    // Comment already saved; a failed push should not roll it back.
  }

  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  revalidateActivity(profile.id);
}

export async function updateComment(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const id = String(formData.get("id") || "");
  const postId = String(formData.get("post_id") || "");
  const body = String(formData.get("body") || "").trim();
  if (!id || !body) throw new Error("Write a comment first.");
  assertCleanText(body);

  const { data: existing } = await supabase.from("comments").select("created_at, author_id").eq("id", id).maybeSingle();
  if (!existing) throw new Error("Comment not found.");
  if (existing.author_id !== profile.id) throw new Error("You can only edit your own comment.");
  assertEditable(existing.created_at);

  const { error } = await supabase.from("comments").update({ body }).eq("id", id).eq("author_id", profile.id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  if (postId) revalidatePath(`/posts/${postId}`);
}

export async function fetchCommentRevisions(commentId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("comment_revisions")
    .select("id, body, created_at")
    .eq("comment_id", commentId)
    .order("created_at", { ascending: true });
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      throw new Error("Edit history is not set up yet. In Supabase, run supabase/edit-history.sql.");
    }
    throw new Error(error.message);
  }
  return data || [];
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
  revalidateActivity();
}
