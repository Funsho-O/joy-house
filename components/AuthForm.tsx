"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/format";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.26-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.997 8.997 0 0 0 .96 4.96L3.97 7.29C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function AuthForm({ mode, notice }: { mode: "login" | "signup"; notice?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const displayName = String(form.get("display_name") || "");
    const supabase = createClient();

    try {
      if (isSignup) {
        const { error: signError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${siteUrl()}/auth/callback`,
            data: { display_name: displayName },
          },
        });
        if (signError) throw signError;
        setInfo("Check your email to verify your account before you can join the community.");
      } else {
        const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
        if (signError) throw signError;
        window.location.href = "/";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl()}/auth/callback` },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="auth-card">
      <h1 className="auth-title">{isSignup ? "Join Joy House" : "Welcome back"}</h1>
      <p className="auth-sub">
        Private community for House of Joy Youth · RCCG Pretoria. Only verified members can post or comment.
      </p>
      {notice ? <div className="banner-warn">{notice}</div> : null}
      {error ? <div className="banner-error">{error}</div> : null}
      {info ? <div className="banner-ok">{info}</div> : null}
      <form onSubmit={onSubmit}>
        {isSignup ? (
          <div className="form-row">
            <label className="form-label" htmlFor="display_name">
              Display name
            </label>
            <input className="form-input" id="display_name" name="display_name" required placeholder="Adaeze J." />
          </div>
        ) : null}
        <div className="form-row">
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <input className="form-input" id="email" name="email" type="email" required placeholder="you@example.com" />
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="password">
            Password
          </label>
          <input className="form-input" id="password" name="password" type="password" minLength={8} required />
        </div>
        <button className="submit-btn" type="submit" disabled={pending}>
          {pending ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="divider">or</div>
      <button className="google-btn" type="button" onClick={onGoogle}>
        <GoogleIcon /> Continue with Google
      </button>
      <p className="auth-alt">
        {isSignup ? (
          <>
            Already a member? <a href="/login">Sign in</a>
          </>
        ) : (
          <>
            New here? <a href="/signup">Create an account</a>
          </>
        )}
      </p>
    </div>
  );
}
