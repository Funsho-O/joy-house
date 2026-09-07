export const PUSH_PROMPT_KEY = "joy-house-push-prompted";

export function vapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}

export function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function subscribeToPush() {
  const key = vapidPublicKey();
  if (!pushSupported() || !key) {
    throw new Error("Push notifications are not available in this browser.");
  }

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked in this browser. Enable them in Chrome settings, then try again.");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Could not create a push subscription.");
  }

  return { endpoint, p256dh, auth };
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
}
