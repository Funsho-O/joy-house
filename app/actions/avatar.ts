"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";

async function clearAvatarFolder(
  supabase: Awaited<ReturnType<typeof requireVerifiedUser>>["supabase"],
  userId: string
) {
  const { data: files } = await supabase.storage.from("avatars").list(userId);
  if (!files?.length) return;
  await supabase.storage.from("avatars").remove(files.map((file) => `${userId}/${file.name}`));
}

function revalidateAvatarPaths() {
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/posts", "layout");
}

export async function saveAvatarUrl(publicUrl: string) {
  const { supabase, profile } = await requireVerifiedUser();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prefix = `${base}/storage/v1/object/public/avatars/${profile.id}/`;
  if (!base || !publicUrl.startsWith(prefix)) {
    throw new Error("Invalid photo.");
  }
  const { error } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", profile.id);
  if (error) throw new Error(error.message);
  revalidateAvatarPaths();
}

export async function removeAvatar() {
  const { supabase, profile } = await requireVerifiedUser();
  await clearAvatarFolder(supabase, profile.id);
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
  if (error) throw new Error(error.message);
  revalidateAvatarPaths();
}
