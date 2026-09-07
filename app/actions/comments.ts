"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { assertCleanText } from "@/lib/profanity";
import { notifyReply } from "@/lib/push";

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
