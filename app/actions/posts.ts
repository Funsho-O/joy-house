"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { CATEGORIES, type Category } from "@/lib/types";
import { assertCleanText } from "@/lib/profanity";
import { assertOwnPostImageUrl, postImagePathFromUrl, postImageSetupMessage } from "@/lib/post-image";
import { assertEditable } from "@/lib/edit-window";
import { revalidateActivity } from "@/lib/activity";

function asCategory(value: string): Category {
  if ((CATEGORIES as readonly string[]).includes(value)) return value as Category;
  throw new Error("Choose a valid category.");
}

export async function createPost(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const category = asCategory(String(formData.get("category") || "General"));
  const isAnonymous = String(formData.get("is_anonymous") || "") === "true";
  const imageUrl = String(formData.get("image_url") || "").trim() || null;

  if (!title) throw new Error("Please add a title.");
  assertCleanText(title, body);
  if (imageUrl) assertOwnPostImageUrl(imageUrl, profile.id);

  const { error } = await supabase.from("posts").insert({
    title,
    body,
    category,
    author_id: profile.id,
    is_anonymous: isAnonymous,
    ...(imageUrl ? { image_url: imageUrl } : {}),
  });

  if (error) {
    if (error.message.toLowerCase().includes("rate limit")) {
      throw new Error("Slow down — you can post at most 5 times per hour.");
    }
    throw new Error(postImageSetupMessage(error.message));
  }

  revalidatePath("/");
  revalidateActivity(profile.id);
}

export async function updatePost(formData: FormData) {
  const { supabase, profile } = await requireVerifiedUser();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!id || !title) throw new Error("Title is required.");
  assertCleanText(title, body);

  const { data: existing } = await supabase.from("posts").select("created_at, author_id").eq("id", id).maybeSingle();
  if (!existing) throw new Error("Post not found.");
  if (existing.author_id !== profile.id) throw new Error("You can only edit your own post.");
  assertEditable(existing.created_at);

  const { error } = await supabase.from("posts").update({ title, body }).eq("id", id).eq("author_id", profile.id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/posts/${id}`);
}

export async function fetchPostRevisions(postId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("post_revisions")
    .select("id, title, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      throw new Error("Edit history is not set up yet. In Supabase, run supabase/edit-history.sql.");
    }
    throw new Error(error.message);
  }
  return data || [];
}

export async function deletePost(postId: string) {
  const { supabase, profile, isAdmin } = await requireVerifiedUser();
  const { data: existing } = await supabase.from("posts").select("image_url, author_id").eq("id", postId).maybeSingle();
  let query = supabase.from("posts").delete().eq("id", postId);
  if (!isAdmin) query = query.eq("author_id", profile.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
  const path = existing?.image_url ? postImagePathFromUrl(existing.image_url) : null;
  if (path) await supabase.storage.from("post-images").remove([path]);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  revalidateActivity(existing?.author_id || profile.id);
}

export async function togglePin(postId: string, pinned: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("posts").update({ is_pinned: pinned }).eq("id", postId);
  if (error) {
    if (error.message.toLowerCase().includes("at most 3")) {
      throw new Error("You can pin at most 3 posts.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/admin");
}

export async function toggleLike(postId: string, liked: boolean) {
  const { supabase, profile } = await requireVerifiedUser();
  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).maybeSingle();
  if (liked) {
    const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", profile.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: profile.id });
    if (error && error.code !== "23505") throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  revalidateActivity(post?.author_id);
}
