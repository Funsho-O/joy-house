import { createClient } from "@/lib/supabase/server";
import type { CommentNode, Group, GroupMember, GroupPostData, PreviewComment, Profile } from "@/lib/types";

type GroupPostRow = {
  id: string;
  group_id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  like_count: number;
};

type GroupCommentRow = {
  id: string;
  body: string;
  group_post_id: string;
  author_id: string;
  parent_id: string | null;
  created_at: string;
};

export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = (memberships || []).map((row) => row.group_id);
  if (ids.length === 0) return [];

  const { data, error: groupError } = await supabase
    .from("groups")
    .select("id, name, description, created_at")
    .in("id", ids)
    .order("name");
  if (groupError) throw new Error(groupError.message);

  return ((data || []) as Group[]).map((group) => ({ ...group, member_count: 0 }));
}

export async function fetchAllGroups(): Promise<Group[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").select("id, name, description, created_at").order("name");
  if (error) throw new Error(error.message);

  const groups = (data || []) as Omit<Group, "member_count">[];
  if (groups.length === 0) return [];

  const { data: members } = await supabase.from("group_members").select("group_id");
  const counts = new Map<string, number>();
  (members || []).forEach((row) => {
    counts.set(row.group_id, (counts.get(row.group_id) || 0) + 1);
  });

  return groups.map((group) => ({ ...group, member_count: counts.get(group.id) || 0 }));
}

export async function fetchGroup(id: string): Promise<Group | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, description, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { count } = await supabase
    .from("group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", id);

  return { ...(data as Omit<Group, "member_count">), member_count: count || 0 };
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("user_id, added_at")
    .eq("group_id", groupId)
    .order("added_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role")
    .in(
      "id",
      rows.map((row) => row.user_id)
    );
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  return rows.map((row) => ({
    user_id: row.user_id,
    display_name: profileMap.get(row.user_id)?.display_name || "Member",
    avatar_url: (profileMap.get(row.user_id)?.avatar_url as string | null) || null,
    role: (profileMap.get(row.user_id)?.role as GroupMember["role"]) || "member",
    added_at: row.added_at,
  }));
}

export async function fetchDirectory(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role")
    .order("display_name");
  if (error) throw new Error(error.message);
  return (data || []) as Profile[];
}

async function hydrateGroupPosts(rows: GroupPostRow[], userId: string): Promise<GroupPostData[]> {
  const supabase = await createClient();
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const authorIds = Array.from(new Set(rows.map((row) => row.author_id)));

  const [{ data: profiles }, { data: comments }, { data: myLikes }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds),
    supabase
      .from("group_comments")
      .select("id, body, group_post_id, author_id, parent_id, created_at")
      .in("group_post_id", ids)
      .order("created_at", { ascending: true }),
    supabase.from("group_likes").select("group_post_id").eq("user_id", userId).in("group_post_id", ids),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  const commentAuthorIds = Array.from(new Set((comments || []).map((c) => c.author_id)));
  const missing = commentAuthorIds.filter((id) => !profileMap.has(id));
  if (missing.length) {
    const { data: extra } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", missing);
    (extra || []).forEach((p) => profileMap.set(p.id, p));
  }

  const liked = new Set((myLikes || []).map((row) => row.group_post_id));
  const commentsByPost = new Map<string, GroupCommentRow[]>();
  (comments || []).forEach((comment) => {
    const list = commentsByPost.get(comment.group_post_id) || [];
    list.push(comment as GroupCommentRow);
    commentsByPost.set(comment.group_post_id, list);
  });

  return rows.map((row) => {
    const author = profileMap.get(row.author_id);
    const postComments = commentsByPost.get(row.id) || [];
    const preview: PreviewComment[] = postComments.slice(0, 2).map((comment) => ({
      id: comment.id,
      body: comment.body,
      author_id: comment.author_id,
      author_name: profileMap.get(comment.author_id)?.display_name || "Member",
      author_avatar_url: (profileMap.get(comment.author_id)?.avatar_url as string | null) || null,
    }));

    return {
      id: row.id,
      group_id: row.group_id,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
      like_count: row.like_count,
      author_id: row.author_id,
      author_name: author?.display_name || "Member",
      author_avatar_url: (author?.avatar_url as string | null) || null,
      comment_count: postComments.length,
      liked_by_me: liked.has(row.id),
      preview_comments: preview,
    };
  });
}

export async function fetchGroupFeed(groupId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_posts")
    .select("id, group_id, author_id, title, body, created_at, like_count")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return hydrateGroupPosts((data || []) as GroupPostRow[], userId);
}

export async function fetchGroupPost(id: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_posts")
    .select("id, group_id, author_id, title, body, created_at, like_count")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [post] = await hydrateGroupPosts([data as GroupPostRow], userId);
  return post;
}

export async function fetchGroupComments(postId: string): Promise<CommentNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_comments")
    .select("id, body, group_post_id, author_id, parent_id, created_at")
    .eq("group_post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data || []) as GroupCommentRow[];
  const authorIds = Array.from(new Set(rows.map((row) => row.author_id)));
  const { data: profiles } = authorIds.length
    ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds)
    : { data: [] };
  const names = new Map((profiles || []).map((p) => [p.id, p.display_name]));
  const avatars = new Map((profiles || []).map((p) => [p.id, p.avatar_url as string | null]));

  const nodes = new Map<string, CommentNode>();
  rows.forEach((row) => {
    nodes.set(row.id, {
      id: row.id,
      body: row.body,
      post_id: row.group_post_id,
      author_id: row.author_id,
      author_name: names.get(row.author_id) || "Member",
      author_avatar_url: avatars.get(row.author_id) || null,
      parent_id: row.parent_id,
      created_at: row.created_at,
      replies: [],
    });
  });

  const roots: CommentNode[] = [];
  nodes.forEach((node) => {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}
