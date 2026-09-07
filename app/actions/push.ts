"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";

function validEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function savePushSubscription(input: { endpoint: string; p256dh: string; auth: string }) {
  const { supabase, profile } = await requireVerifiedUser();
  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.p256dh || "").trim();
  const auth = String(input.auth || "").trim();
  if (!validEndpoint(endpoint) || !p256dh || !auth) {
    throw new Error("Invalid push subscription.");
  }

  const { error } = await supabase.rpc("upsert_push_subscription", {
    target_endpoint: endpoint,
    target_p256dh: p256dh,
    target_auth: auth,
  });
  if (error) {
    if (/function .* does not exist/i.test(error.message) || /schema cache/i.test(error.message)) {
      throw new Error("Push notifications are not set up yet. In Supabase, run supabase/push-notifications.sql.");
    }
    throw new Error(error.message);
  }

  const { error: flagError } = await supabase
    .from("profiles")
    .update({ push_enabled: true })
    .eq("id", profile.id);
  if (flagError && !/column .*push_enabled/i.test(flagError.message)) {
    throw new Error(flagError.message);
  }

  revalidatePath("/profile");
}

export async function disablePushNotifications() {
  const { supabase, profile } = await requireVerifiedUser();
  await supabase.from("push_subscriptions").delete().eq("user_id", profile.id);
  const { error } = await supabase.from("profiles").update({ push_enabled: false }).eq("id", profile.id);
  if (error && !/column .*push_enabled/i.test(error.message)) {
    throw new Error(error.message);
  }
  revalidatePath("/profile");
}
