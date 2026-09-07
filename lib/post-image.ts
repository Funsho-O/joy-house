export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const POST_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const POST_IMAGE_TOO_LARGE = "That photo is too large. Please choose an image under 5MB.";

export function postImagePathFromUrl(url: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !url) return null;
  const prefix = `${base}/storage/v1/object/public/post-images/`;
  if (!url.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length).split("?")[0] || "");
  return path || null;
}

export function assertOwnPostImageUrl(url: string, userId: string) {
  const path = postImagePathFromUrl(url);
  if (!path || path.split("/")[0] !== userId) {
    throw new Error("Invalid photo.");
  }
}

export function postImageSetupMessage(message: string) {
  if (/bucket not found/i.test(message) || /column .*image_url/i.test(message) || /schema cache/i.test(message)) {
    return "Photo storage is not set up yet. In Supabase, open the SQL editor and run supabase/post-images.sql.";
  }
  return message;
}
