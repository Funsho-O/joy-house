import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchDirectory } from "@/lib/groups";
import { Navbar } from "@/components/Navbar";
import { AdminRoleManager } from "@/app/admin/AdminRoleManager";

export default async function AdminMembersPage() {
  const { profile, isAdmin, groups } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");
  const people = await fetchDirectory();

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/admin">
        <IconArrowLeft size={16} /> Back to admin queue
      </a>
      <div className="section-label">Assign admins</div>
      <p className="auth-sub">
        Admins can pin posts, review reports, manage groups, and assign other admins.
      </p>
      <AdminRoleManager people={people} />
    </>
  );
}
