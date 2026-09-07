import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchGroup, fetchGroupComments, fetchGroupPost } from "@/lib/groups";
import { createGroupComment, deleteGroupComment } from "@/app/actions/groups";
import { Navbar } from "@/components/Navbar";
import { GroupPostCard } from "@/components/GroupPostCard";
import { CommentThread } from "@/components/CommentThread";

export default async function GroupPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const { user, profile, groups } = await getAuthContext();
  if (!user || !profile) redirect("/login");
  if (!groups.some((group) => group.id === id)) redirect("/groups");

  const group = await fetchGroup(id);
  const post = await fetchGroupPost(postId, user.id);
  if (!group || !post || post.group_id !== id) notFound();
  const comments = await fetchGroupComments(postId);

  async function onCreate(formData: FormData) {
    "use server";
    formData.set("group_id", id);
    await createGroupComment(formData);
  }

  async function onDelete(commentId: string, targetPostId: string) {
    "use server";
    await deleteGroupComment(commentId, targetPostId, id);
  }

  return (
    <>
      <Navbar profile={profile} groups={groups} active="groups" />
      <a className="back-link" href={`/groups/${id}`}>
        <IconArrowLeft size={16} /> Back to {group.name}
      </a>
      <GroupPostCard post={post} profile={profile} showPreview={false} />
      <CommentThread
        postId={postId}
        comments={comments}
        profile={profile}
        onCreate={onCreate}
        onDelete={onDelete}
        allowReport={false}
      />
    </>
  );
}
