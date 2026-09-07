import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchDirectory, fetchGroup, fetchGroupMembers } from "@/lib/groups";
import { Navbar } from "@/components/Navbar";
import { GroupMemberManager } from "@/app/admin/GroupMemberManager";
import { DeleteGroupButton } from "@/app/admin/DeleteGroupButton";

export default async function AdminGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isAdmin, groups } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");

  const group = await fetchGroup(id);
  if (!group) notFound();
  const [members, directory] = await Promise.all([fetchGroupMembers(id), fetchDirectory()]);

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/admin/groups">
        <IconArrowLeft size={16} /> Back to groups
      </a>
      <h1 className="auth-title">{group.name}</h1>
      {group.description ? <p className="auth-sub">{group.description}</p> : null}
      <div className="group-admin-actions">
        <DeleteGroupButton groupId={id} groupName={group.name} />
      </div>
      <GroupMemberManager groupId={id} members={members} directory={directory} />
    </>
  );
}
