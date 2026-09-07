"use client";

import { useEffect, useState, useTransition } from "react";
import { disablePushNotifications, savePushSubscription } from "@/app/actions/push";
import { PUSH_PROMPT_KEY, pushSupported, subscribeToPush, unsubscribeFromPush, vapidPublicKey } from "@/lib/push-client";
import type { Profile } from "@/lib/types";

export function NotificationSettings({ profile }: { profile: Profile }) {
  const [enabled, setEnabled] = useState(profile.push_enabled !== false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const available = pushSupported() && Boolean(vapidPublicKey());

  useEffect(() => {
    if (!pushSupported()) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => undefined);
  }, []);

  function turnOn() {
    setError(null);
    startTransition(async () => {
      try {
        if (!available) throw new Error("Push notifications are not available in this browser.");
        await savePushSubscription(await subscribeToPush());
        localStorage.setItem(PUSH_PROMPT_KEY, "1");
        setEnabled(true);
        setSubscribed(true);
        setPermission(Notification.permission);
      } catch (err) {
        setPermission(pushSupported() ? Notification.permission : permission);
        setError(err instanceof Error ? err.message : "Could not enable notifications.");
      }
    });
  }

  function turnOff() {
    setError(null);
    startTransition(async () => {
      try {
        await unsubscribeFromPush();
        await disablePushNotifications();
        localStorage.setItem(PUSH_PROMPT_KEY, "1");
        setEnabled(false);
        setSubscribed(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not turn notifications off.");
      }
    });
  }

  return (
    <div className="form-row notification-settings">
      <p className="form-label">Reply notifications</p>
      <p className="auth-sub avatar-hint">
        Push a notice to this device when someone replies to your post or comment. Works best on Android after you
        install Joy House.
      </p>
      {error ? <div className="banner-error">{error}</div> : null}
      {!available ? (
        <p className="anon-hint">This browser does not support Web Push.</p>
      ) : permission === "denied" ? (
        <p className="anon-hint">
          Notifications are blocked in this browser. Enable them in Chrome settings, then turn this on.
        </p>
      ) : null}
      <div className="anon-options" role="group" aria-label="Reply notifications">
        <button
          type="button"
          className={`anon-option${enabled ? " selected" : ""}`}
          aria-pressed={enabled}
          disabled={pending || !available}
          onClick={turnOn}
        >
          On
        </button>
        <button
          type="button"
          className={`anon-option${!enabled ? " selected" : ""}`}
          aria-pressed={!enabled}
          disabled={pending}
          onClick={turnOff}
        >
          Off
        </button>
      </div>
      {available && permission !== "denied" ? (
        <p className="anon-hint">
          {subscribed ? "This device will receive replies." : "This device is not subscribed yet."}
        </p>
      ) : null}
    </div>
  );
}
