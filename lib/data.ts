import { createClient } from "@/lib/supabase/server";
import type { Category, CommentNode, PostCardData, PreviewComment, Profile, ReportItem } from "@/lib/types";

type VisiblePost = {
  id: string;
  title: string;
  body: string;
  category: Category;
  is_anonymous: boolean;
  created_at: string;
  like_count: number;
  is_pinned: boolean;
  image_url: string | null;
  author_id: string | null;
  admin_author_id: string | null;
};

type CommentRow = {
  id: string;
  body: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  created_at: string;
};

function displayName(
  post: Pick<VisiblePost, "is_anonymous">,
  profile: Pick<Profile, "display_name"> | null,
  isAdmin: boolean,
  adminProfile: Pick<Profile, "display_name"> | null
) {
  if (post.is_anonymous && !isAdmin) return "Member";
  if (post.is_anonymous && isAdmin) return adminProfile?.display_name || profile?.display_name || "Member";
  return profile?.display_name || "Member";
}

function displayAvatar(
  post: Pick<VisiblePost, "is_anonymous">,
  profile: Pick<Profile, "avatar_url"> | null,
  isAdmin: boolean,
  adminProfile: Pick<Profile, "avatar_url"> | null
) {
  if (post.is_anonymous && !isAdmin) return null;
  if (post.is_anonymous && isAdmin) return adminProfile?.avatar_url || profile?.avatar_url || null;
  return profile?.avatar_url || null;
}

async function hydratePosts(
  rows: VisiblePost[],
  userId: string,
  isAdmin: boolean
): Promise<PostCardData[]> {
  const supabase = await createClient();
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const authorIds = Array.from(
    new Set(rows.flatMap((row) => [row.author_id, row.admin_author_id].filter(Boolean) as string[]))
  );

  const [{ data: profiles }, { data: comments }, { data: myLikes }, { data: recentLikes }] =
    await Promise.all([
      authorIds.length
        ? supabase.from("profiles").select("id, display_name, avatar_url, role").in("id", authorIds)
        : Promise.resolve({ data: [] as Profile[] }),
      supabase
        .from("comments")
        .select("id, body, post_id, author_id, parent_id, created_at")
        .in("post_id", ids)
        .order("created_at", { ascending: true }),
      supabase.from("likes").select("post_id").eq("user_id", userId).in("post_id", ids),
      supabase
        .from("likes")
        .select("post_id")
        .in("post_id", ids)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p as Profile]));
  const commentAuthorIds = Array.from(new Set((comments || []).map((c) => c.author_id)));
  const missingAuthors = commentAuthorIds.filter((id) => !profileMap.has(id));
  if (missingAuthors.length) {
    const { data: extra } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, role")
      .in("id", missingAuthors);
    (extra || []).forEach((p) => profileMap.set(p.id, p as Profile));
  }

  const liked = new Set((myLikes || []).map((row) => row.post_id));
  const likes24 = new Map<string, number>();
  (recentLikes || []).forEach((row) => {
    likes24.set(row.post_id, (likes24.get(row.post_id) || 0) + 1);
  });

  const commentsByPost = new Map<string, CommentRow[]>();
  (comments || []).forEach((comment) => {
    const list = commentsByPost.get(comment.post_id) || [];
    list.push(comment as CommentRow);
    commentsByPost.set(comment.post_id, list);
  });

  return rows.map((row) => {
    const profile = row.author_id ? profileMap.get(row.author_id) || null : null;
    const adminProfile = row.admin_author_id ? profileMap.get(row.admin_author_id) || null : null;
    const postComments = commentsByPost.get(row.id) || [];
    const preview: PreviewComment[] = postComments.slice(0, 2).map((comment) => ({
      id: comment.id,
      body: comment.body,
      author_id: comment.author_id,
      author_name: profileMap.get(comment.author_id)?.display_name || "Member",
      author_avatar_url: profileMap.get(comment.author_id)?.avatar_url || null,
    }));

    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category,
      is_anonymous: row.is_anonymous,
      created_at: row.created_at,
      like_count: row.like_count,
      is_pinned: row.is_pinned,
      author_id: row.author_id,
      author_name: displayName(row, profile, isAdmin, adminProfile),
      author_avatar_url: displayAvatar(row, profile, isAdmin, adminProfile),
      comment_count: postComments.length,
      liked_by_me: liked.has(row.id),
      preview_comments: preview,
      likes_last_24h: likes24.get(row.id) || 0,
      image_url: row.image_url || null,
    };
  });
}

export async function fetchFeed(userId: string, isAdmin: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts_visible")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return hydratePosts((data || []) as VisiblePost[], userId, isAdmin);
}

export async function fetchPost(id: string, userId: string, isAdmin: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts_visible").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [post] = await hydratePosts([data as VisiblePost], userId, isAdmin);
  return post;
}

export async function fetchComments(postId: string): Promise<CommentNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, body, post_id, author_id, parent_id, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data || []) as CommentRow[];
  const authorIds = Array.from(new Set(rows.map((row) => row.author_id)));
  const { data: profiles } = authorIds.length
    ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds)
    : { data: [] };
  const names = new Map((profiles || []).map((p) => [p.id, p.display_name]));
  const avatars = new Map((profiles || []).map((p) => [p.id, p.avatar_url as string | null]));

  const nodes = new Map<string, CommentNode>();
  rows.forEach((row) => {
    nodes.set(row.id, {
      ...row,
      author_name: names.get(row.author_id) || "Member",
      author_avatar_url: avatars.get(row.author_id) || null,
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

export async function fetchReports(): Promise<ReportItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, target_type, post_id, comment_id, reason, created_at, resolved, reported_by")
    .eq("resolved", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const reports = data || [];
  if (reports.length === 0) return [];

  const reporterIds = Array.from(new Set(reports.map((r) => r.reported_by)));
  const postIds = Array.from(new Set(reports.map((r) => r.post_id).filter(Boolean))) as string[];
  const commentIds = Array.from(new Set(reports.map((r) => r.comment_id).filter(Boolean))) as string[];

  const [{ data: reporters }, { data: posts }, { data: comments }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", reporterIds),
    postIds.length ? supabase.from("posts").select("id, title").in("id", postIds) : Promise.resolve({ data: [] }),
    commentIds.length
      ? supabase.from("comments").select("id, body, post_id").in("id", commentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const reporterMap = new Map((reporters || []).map((p) => [p.id, p.display_name]));
  const postMap = new Map((posts || []).map((p) => [p.id, p.title]));
  const commentMap = new Map((comments || []).map((c) => [c.id, c]));

  return reports.map((report) => {
    const comment = report.comment_id ? commentMap.get(report.comment_id) : null;
    return {
      id: report.id,
      target_type: report.target_type,
      post_id: report.post_id || comment?.post_id || null,
      comment_id: report.comment_id,
      reason: report.reason,
      created_at: report.created_at,
      resolved: report.resolved,
      reporter_name: reporterMap.get(report.reported_by) || "Member",
      post_title: report.post_id ? postMap.get(report.post_id) || null : null,
      comment_body: comment?.body || null,
    };
  });
}
