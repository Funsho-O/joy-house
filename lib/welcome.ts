export const WELCOME_MS = 24 * 60 * 60 * 1000;

export function isWelcomeLive(post: { is_welcome?: boolean; created_at: string }) {
  if (!post.is_welcome) return false;
  const created = new Date(post.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < WELCOME_MS;
}
