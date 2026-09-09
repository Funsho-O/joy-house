import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchBirthdayAlerts, fetchReports } from "@/lib/data";
import { Navbar } from "@/components/Navbar";
import { AdminNav } from "@/app/admin/AdminNav";
import { AdminQueue } from "@/app/admin/AdminQueue";
import { BirthdayAlerts } from "@/app/admin/BirthdayAlerts";

export default async function AdminPage() {
  const { profile, isAdmin, groups } = await getAuthContext();
  if (!profile) redirect("/login");
  if (!isAdmin) redirect("/");
  const reports = await fetchReports();
  const birthdayAlerts = await fetchBirthdayAlerts();

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <AdminNav active="queue" />
      <BirthdayAlerts alerts={birthdayAlerts} />
      <div className="section-label">Reports</div>
      <AdminQueue reports={reports} />
    </>
  );
}
