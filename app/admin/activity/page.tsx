import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchAdminMemberActivity, fetchWeeklyEngagement } from "@/lib/activity";
import type { AdminMemberActivity, WeeklyEngagement } from "@/lib/types";
import { Navbar } from "@/components/Navbar";
import { AdminNav } from "@/app/admin/AdminNav";
import { ActivityDashboard } from "@/app/admin/ActivityDashboard";

export default async function AdminActivityPage() {
  const { profile, isAdmin, groups } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");

  let members: AdminMemberActivity[] = [];
  let weeks: WeeklyEngagement[] = [];
  let setupError: string | null = null;
  try {
    [members, weeks] = await Promise.all([fetchAdminMemberActivity(), fetchWeeklyEngagement()]);
  } catch (err) {
    setupError = err instanceof Error ? err.message : "Could not load activity.";
  }

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <AdminNav active="activity" />
      <p className="auth-sub">
        Community posts, comments, and likes. Members who have not posted in over two weeks are flagged for a
        pastoral check-in.
      </p>
      {setupError ? (
        <div className="banner-error">{setupError}</div>
      ) : (
        <ActivityDashboard members={members} weeks={weeks} />
      )}
    </>
  );
}
