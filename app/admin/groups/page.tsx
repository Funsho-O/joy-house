import { redirect } from "next/navigation";
import { IconArrowLeft, IconUsers } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchAllGroups } from "@/lib/groups";
import { Navbar } from "@/components/Navbar";
import { AdminNav } from "@/app/admin/AdminNav";
import { CreateGroupForm } from "@/app/admin/CreateGroupForm";

export default async function AdminGroupsPage() {
  const { profile, isAdmin, groups } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");
  const allGroups = await fetchAllGroups();

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <AdminNav active="groups" />
      <CreateGroupForm />
      {allGroups.length === 0 ? (
        <div className="empty-state">No groups yet.</div>
      ) : (
        allGroups.map((group) => (
          <a className="group-card" href={`/admin/groups/${group.id}`} key={group.id}>
            <div className="group-card-icon">
              <IconUsers size={18} />
            </div>
            <div>
              <div className="group-card-name">{group.name}</div>
              <p className="group-card-desc">
                {group.member_count} {group.member_count === 1 ? "member" : "members"}
                {group.description ? ` · ${group.description}` : ""}
              </p>
            </div>
          </a>
        ))
      )}
    </>
  );
}
