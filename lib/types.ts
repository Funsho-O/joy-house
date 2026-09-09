export const CATEGORIES = ["Prayer", "Bible Study", "Events", "General"] as const;
export type Category = (typeof CATEGORIES)[number];

export type UserRole = "member" | "admin";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  push_enabled: boolean;
  date_of_birth: string | null;
  celebrate_birthday: boolean;
  deactivated_at: string | null;
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
  image_url: string | null;
  edited_at: string | null;
  is_birthday: boolean;
};

export type PostRevision = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export type CommentRevision = {
  id: string;
  body: string;
  created_at: string;
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
  edited_at: string | null;
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
  role: UserRole;
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
  edited_at: string | null;
};

export const BADGE_IDS = [
  "first_post",
  "prayer_warrior",
  "encourager",
  "trending",
  "faithful",
  "most_loved",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
  comment_count: number;
  like_count: number;
  score: number;
};

export type BadgeAward = {
  id: BadgeId;
  earned_at: string | null;
};

export type AdminMemberActivity = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
  comment_count: number;
  like_count: number;
  last_post_at: string | null;
  last_active_at: string | null;
  member_since: string;
  needs_follow_up: boolean;
};

export type WeeklyEngagement = {
  week_start: string;
  post_count: number;
  comment_count: number;
  like_count: number;
};

export type BirthdayAlert = {
  id: string;
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  year: number;
  created_at: string;
};

export type NotificationKind = "post_reply" | "comment_reply" | "post_like";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  post_id: string;
  post_title: string;
  actor_name: string;
  actor_avatar_url: string | null;
  created_at: string;
};
