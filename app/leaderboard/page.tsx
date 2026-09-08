import { redirect } from "next/navigation";
import { IconArrowLeft, IconTrophy } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchLeaderboard } from "@/lib/activity";
import type { LeaderboardEntry } from "@/lib/types";
import { Navbar } from "@/components/Navbar";
import { LeaderboardView } from "@/components/LeaderboardView";

export default async function LeaderboardPage() {
  const { profile, groups } = await getAuthContext();
  if (!profile) redirect("/login");

  let week: LeaderboardEntry[] = [];
  let allTime: LeaderboardEntry[] = [];
  let setupError: string | null = null;
  try {
    [week, allTime] = await Promise.all([fetchLeaderboard("week"), fetchLeaderboard("all")]);
  } catch (err) {
    setupError = err instanceof Error ? err.message : "Could not load the leaderboard.";
  }

  return (
    <>
      <Navbar profile={profile} groups={groups} active="leaderboard" />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <div className="group-heading">
        <h1 className="auth-title">
          <IconTrophy size={22} /> Leaderboard
        </h1>
        <p className="auth-sub">
          1 point per named post, comment, and like received on a named post. Anonymous posts and their likes do not
          count, so anonymous posting stays private.
        </p>
      </div>
      {setupError ? <div className="banner-error">{setupError}</div> : <LeaderboardView week={week} allTime={allTime} profile={profile} />}
    </>
  );
}
