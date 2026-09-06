import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchReports } from "@/lib/data";
import { Navbar } from "@/components/Navbar";
import { AdminQueue } from "@/app/admin/AdminQueue";

export default async function AdminPage() {
  const { profile, isAdmin } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");
  const reports = await fetchReports();

  return (
    <>
      <Navbar profile={profile} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <div className="section-label">Admin queue</div>
      <AdminQueue reports={reports} />
    </>
  );
}
