import { redirect } from "next/navigation";
import { IconArrowLeft, IconUsers } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchMyGroups } from "@/lib/groups";
import { Navbar } from "@/components/Navbar";

export default async function GroupsPage() {
  const { user, profile, groups } = await getAuthContext();
  if (!user || !profile) redirect("/login");
  if (groups.length === 0) redirect("/");

  const mine = await fetchMyGroups(user.id);

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <div className="section-label">Your groups</div>
      {mine.map((group) => (
        <a className="group-card" href={`/groups/${group.id}`} key={group.id}>
          <div className="group-card-icon">
            <IconUsers size={18} />
          </div>
          <div>
            <div className="group-card-name">{group.name}</div>
            {group.description ? <p className="group-card-desc">{group.description}</p> : null}
          </div>
        </a>
      ))}
    </>
  );
}
