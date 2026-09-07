export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function editWindowRemaining(createdAt: string, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, created + EDIT_WINDOW_MS - now);
}

export function canEditWithinWindow(createdAt: string, now = Date.now()) {
  return editWindowRemaining(createdAt, now) > 0;
}

export function formatEditCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function assertEditable(createdAt: string) {
  if (!canEditWithinWindow(createdAt)) {
    throw new Error("Edits are only allowed for 15 minutes after posting.");
  }
}
