"use client";

import { useTransition } from "react";
import { Logo } from "@/components/Brand";
import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/format";
import { useState } from "react";

export default function VerifyEmailPage() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("No email on this session. Please sign up again.");
      return;
    }
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (resendError) setError(resendError.message);
    else setInfo("Verification email sent. Check your inbox.");
  }

  return (
    <>
      <div className="topbar">
        <Logo href="/verify-email" />
      </div>
      <div className="auth-card">
        <h1 className="auth-title">Verify your email</h1>
        <p className="auth-sub">
          Joy House is private. Confirm your email before you can read, post, or comment.
        </p>
        {error ? <div className="banner-error">{error}</div> : null}
        {info ? <div className="banner-ok">{info}</div> : null}
        <button className="submit-btn" type="button" onClick={resend}>
          Resend verification email
        </button>
        <button
          className="google-btn"
          type="button"
          style={{ marginTop: 10 }}
          disabled={pending}
          onClick={() => startTransition(() => signOut())}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
