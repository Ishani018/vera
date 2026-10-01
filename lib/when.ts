/**
 * "four minutes ago", for a draft that was open a moment before a reload.
 *
 * Rounded and vague on purpose: the exact second a draft was written is of no
 * use to anybody, and "a moment ago" is the true answer for anything inside a
 * minute and a half. Pure, so it can be checked without a clock.
 */
export function when(at: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 90) return 'a moment ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
