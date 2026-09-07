import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchComments, fetchPost } from "@/lib/data";
import { Navbar } from "@/components/Navbar";
import { PostCard } from "@/components/PostCard";
import { CommentThread } from "@/components/CommentThread";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile, isAdmin, groups } = await getAuthContext();
  if (!user || !profile) redirect("/login");

  const post = await fetchPost(id, user.id, isAdmin);
  if (!post) notFound();
  const comments = await fetchComments(id);

  return (
    <>
      <Navbar profile={profile} groups={groups} active="feed" />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <PostCard post={post} profile={profile} showPreview={false} />
      <CommentThread postId={id} comments={comments} profile={profile} />
    </>
  );
}
