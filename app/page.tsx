import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { fetchFeed } from "@/lib/data";
import { Feed } from "@/components/Feed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user, profile, isAdmin } = await getAuthContext();
  if (!user || !profile) redirect("/login");
  const posts = await fetchFeed(user.id, isAdmin);
  return <Feed posts={posts} profile={profile} />;
}
