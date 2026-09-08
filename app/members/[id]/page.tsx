import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchBadgeAwards, fetchMemberProfile } from "@/lib/activity";
import { Navbar } from "@/components/Navbar";
import { UserAvatar } from "@/components/UserAvatar";
import { BadgeGrid } from "@/components/BadgeGrid";

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, groups } = await getAuthContext();
  if (!profile) redirect("/login");

  const member = await fetchMemberProfile(id);
  if (!member) notFound();
  const awards = await fetchBadgeAwards(id);
  const isSelf = member.id === profile.id;

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href={isSelf ? "/profile" : "/leaderboard"}>
        <IconArrowLeft size={16} /> {isSelf ? "Back to your profile" : "Back to leaderboard"}
      </a>
      <div className="profile-hero post-card">
        <UserAvatar name={member.display_name} src={member.avatar_url} />
        <div>
          <h1 className="auth-title">{member.display_name}</h1>
          <p className="auth-sub">{member.role === "admin" ? "Admin" : "Member"}</p>
          {isSelf ? (
            <a className="back-link" href="/profile">
              Edit profile
            </a>
          ) : null}
        </div>
      </div>
      <div className="section-label">Badges</div>
      <BadgeGrid awards={awards} />
    </>
  );
}
