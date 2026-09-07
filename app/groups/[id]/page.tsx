import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { fetchGroup, fetchGroupFeed } from "@/lib/groups";
import { GroupFeed } from "@/components/GroupFeed";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile, groups } = await getAuthContext();
  if (!user || !profile) redirect("/login");
  if (!groups.some((group) => group.id === id)) redirect("/groups");

  const group = await fetchGroup(id);
  if (!group) notFound();
  const posts = await fetchGroupFeed(id, user.id);

  return <GroupFeed group={group} posts={posts} profile={profile} groups={groups} />;
}
