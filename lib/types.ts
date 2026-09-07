export const CATEGORIES = ["Prayer", "Bible Study", "Events", "General"] as const;
export type Category = (typeof CATEGORIES)[number];

export type UserRole = "member" | "admin";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
};

export type PreviewComment = {
  id: string;
  body: string;
  author_name: string;
  author_id: string;
  author_avatar_url: string | null;
};

export type PostCardData = {
  id: string;
  title: string;
  body: string;
  category: Category;
  is_anonymous: boolean;
  created_at: string;
  like_count: number;
  is_pinned: boolean;
  author_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  comment_count: number;
  liked_by_me: boolean;
  preview_comments: PreviewComment[];
  likes_last_24h: number;
};

export type CommentNode = {
  id: string;
  body: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  parent_id: string | null;
  created_at: string;
  replies: CommentNode[];
};

export type ReportItem = {
  id: string;
  target_type: "post" | "comment";
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  created_at: string;
  resolved: boolean;
  reporter_name: string;
  post_title: string | null;
  comment_body: string | null;
};

export type GroupSummary = {
  id: string;
  name: string;
};

export type Group = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  member_count: number;
};

export type GroupMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  added_at: string;
};

export type GroupPostData = {
  id: string;
  group_id: string;
  title: string;
  body: string;
  created_at: string;
  like_count: number;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  comment_count: number;
  liked_by_me: boolean;
  preview_comments: PreviewComment[];
};
