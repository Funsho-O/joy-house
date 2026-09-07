"use client";

import { useEffect, useState } from "react";
import { IconBell } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { savePushSubscription } from "@/app/actions/push";
import { PUSH_PROMPT_KEY, pushSupported, subscribeToPush, vapidPublicKey } from "@/lib/push-client";

const AUTH_PATHS = ["/login", "/signup", "/verify-email"];

export function PushPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pushSupported() || !vapidPublicKey()) return;
    if (AUTH_PATHS.some((path) => window.location.pathname.startsWith(path))) return;

    let cancelled = false;

    async function setup() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase.from("profiles").select("push_enabled").eq("id", user.id).maybeSingle();
      const enabled = profile?.push_enabled !== false;

      if (Notification.permission === "granted" && enabled) {
        try {
          await savePushSubscription(await subscribeToPush());
        } catch {
          // Missing SQL or a stale VAPID key should not block the app.
        }
        return;
      }

      if (Notification.permission === "default" && !localStorage.getItem(PUSH_PROMPT_KEY)) {
        if (!cancelled) setVisible(true);
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    localStorage.setItem(PUSH_PROMPT_KEY, "1");
    setVisible(false);
  }

  async function allow() {
    localStorage.setItem(PUSH_PROMPT_KEY, "1");
    setVisible(false);
    try {
      await savePushSubscription(await subscribeToPush());
    } catch {
      // Browser denial is enough feedback; they can retry from Profile.
    }
  }

  if (!visible) return null;

  return (
    <div className="push-banner" role="dialog" aria-label="Notification permission">
      <div className="push-banner-copy">
        <IconBell size={16} />
        <p>Get a notification when someone replies to you.</p>
      </div>
      <div className="push-banner-actions">
        <button className="btn-primary" type="button" onClick={allow}>
          Allow
        </button>
        <button className="btn-secondary" type="button" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
