import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchReports } from "@/lib/data";
import { Navbar } from "@/components/Navbar";
import { AdminQueue } from "@/app/admin/AdminQueue";

export default async function AdminPage() {
  const { profile, isAdmin, groups } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");
  const reports = await fetchReports();

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <div className="admin-tabs">
        <span className="section-label">Admin queue</span>
        <div className="admin-tab-links">
          <a className="back-link" href="/admin/groups">
            Manage groups
          </a>
          <a className="back-link" href="/admin/members">
            Assign admins
          </a>
        </div>
      </div>
      <AdminQueue reports={reports} />
    </>
  );
}
