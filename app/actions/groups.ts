"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { assertCleanText } from "@/lib/profanity";
import { notifyReply } from "@/lib/push";

function revalidateGroup(groupId: string, postId?: string) {
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  if (postId) revalidatePath(`/groups/${groupId}/posts/${postId}`);
  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
}

export async function createGroup(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) throw new Error("Group name is required.");
  assertCleanText(name, description);

  const { data, error } = await supabase
    .from("groups")
    .insert({ name, description })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A group with that name already exists.");
    throw new Error(error.message);
  }

  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: data.id,
    user_id: profile.id,
    added_by: profile.id,
  });
  if (memberError) throw new Error(memberError.message);

  revalidatePath("/groups");
  revalidatePath("/admin/groups");
  revalidatePath("/");
}

export async function addGroupMember(groupId: string, userId: string) {
  const { supabase, profile } = await requireAdmin();
  if (!groupId || !userId) throw new Error("Choose a member to add.");
  const { error } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    added_by: profile.id,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidateGroup(groupId);
  revalidatePath("/");
}

export async function removeGroupMember(groupId: string, userId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidateGroup(groupId);
  revalidatePath("/");
}

export async function deleteGroup(groupId: string) {
  const { supabase } = await requireAdmin();
  if (!groupId) throw new Error("Group is required.");
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) throw new Error(error.message);
  revalidatePath("/groups");
  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/");
}

export async function createGroupPost(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const groupId = String(formData.get("group_id") || "");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!groupId || !title) throw new Error("Please add a title.");
  assertCleanText(title, body);

  const { error } = await supabase.from("group_posts").insert({
    group_id: groupId,
    author_id: profile.id,
    title,
    body,
  });
  if (error) {
    if (error.message.toLowerCase().includes("rate limit")) {
      throw new Error("Slow down — you can post at most 5 times per hour.");
    }
    throw new Error(error.message);
  }
  revalidateGroup(groupId);
}

export async function deleteGroupPost(postId: string, groupId: string) {
  const { supabase, profile, isAdmin } = await requireVerifiedUser();
  let query = supabase.from("group_posts").delete().eq("id", postId);
  if (!isAdmin) query = query.eq("author_id", profile.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidateGroup(groupId, postId);
}

export async function toggleGroupLike(postId: string, groupId: string, liked: boolean) {
  const { supabase, profile } = await requireVerifiedUser();
  if (liked) {
    const { error } = await supabase
      .from("group_likes")
      .delete()
      .eq("group_post_id", postId)
      .eq("user_id", profile.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("group_likes").insert({
      group_post_id: postId,
      user_id: profile.id,
    });
    if (error && error.code !== "23505") throw new Error(error.message);
  }
  revalidateGroup(groupId, postId);
}

export async function createGroupComment(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const postId = String(formData.get("post_id") || "");
  const groupId = String(formData.get("group_id") || "");
  const parentId = String(formData.get("parent_id") || "") || null;
  const body = String(formData.get("body") || "").trim();
  if (!postId || !body) throw new Error("Write a comment first.");
  assertCleanText(body);

  const { error } = await supabase.from("group_comments").insert({
    group_post_id: postId,
    parent_id: parentId,
    body,
    author_id: profile.id,
  });
  if (error) throw new Error(error.message);

  try {
    const url = `/groups/${groupId}/posts/${postId}`;
    if (parentId) {
      const { data: parent } = await supabase
        .from("group_comments")
        .select("author_id")
        .eq("id", parentId)
        .maybeSingle();
      if (parent?.author_id) {
        await notifyReply({
          supabase,
          recipientId: parent.author_id,
          actorId: profile.id,
          actorName: profile.display_name,
          url,
          kind: "comment",
          commentBody: body,
        });
      }
    } else {
      const { data: post } = await supabase.from("group_posts").select("author_id").eq("id", postId).maybeSingle();
      if (post?.author_id) {
        await notifyReply({
          supabase,
          recipientId: post.author_id,
          actorId: profile.id,
          actorName: profile.display_name,
          url,
          kind: "post",
          commentBody: body,
        });
      }
    }
  } catch {
    // Comment already saved; a failed push should not roll it back.
  }

  revalidateGroup(groupId || "", postId);
}

export async function deleteGroupComment(commentId: string, postId: string, groupId: string) {
  const { supabase, profile, isAdmin } = await requireVerifiedUser();
  let query = supabase.from("group_comments").delete().eq("id", commentId);
  if (!isAdmin) query = query.eq("author_id", profile.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidateGroup(groupId, postId);
}
