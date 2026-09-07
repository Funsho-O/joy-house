import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

type PushRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function vapidSubject() {
  const raw = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (raw.startsWith("mailto:") || raw.startsWith("https://")) return raw;
  return "mailto:joyhouse@localhost";
}

function vapidConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function previewText(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}…`;
}

export async function notifyReply({
  supabase,
  recipientId,
  actorId,
  actorName,
  url,
  kind,
  commentBody,
}: {
  supabase: SupabaseClient;
  recipientId: string;
  actorId: string;
  actorName: string;
  url: string;
  kind: "post" | "comment";
  commentBody: string;
}) {
  if (!recipientId || recipientId === actorId || !vapidConfigured()) return;

  const { data, error } = await supabase.rpc("get_push_subscriptions", {
    target_user_id: recipientId,
  });
  if (error || !data?.length) return;

  webpush.setVapidDetails(
    vapidSubject(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );

  const preview = previewText(commentBody);
  const payload = JSON.stringify({
    title: "Joy House",
    body:
      kind === "comment"
        ? `${actorName} replied to your comment: ${preview}`
        : `${actorName} replied to your post: ${preview}`,
    url,
  });

  await Promise.all(
    (data as PushRow[]).map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload
        );
      } catch (err) {
        const status =
          typeof err === "object" && err && "statusCode" in err ? Number((err as { statusCode: number }).statusCode) : 0;
        if (status === 404 || status === 410) {
          await supabase.rpc("delete_stale_push_subscription", { target_endpoint: row.endpoint });
        }
      }
    })
  );
}
