import 'server-only';

/**
 * What an export is allowed to be, and how often.
 *
 * Here rather than inside the middleware so that the health endpoint can
 * report the same numbers it is enforcing. Middleware and route handlers are
 * compiled into separate bundles, so the only way for the two to agree is for
 * both to read one module — a health check that states a limit it got from a
 * different copy of the constant is worse than one that states nothing.
 *
 * Every value is an environment variable, read at start-up and not baked in at
 * build time, so they can be raised for a load test without rebuilding:
 *
 *   EXPORT_PER_WINDOW=50 MAX_EXPORT_BODY_MB=800 npm start
 *
 * See docs/HOSTING.md for the whole table.
 */

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The biggest request that could be an honest book.
 *
 * The export posts every picture inline as base64, so a forty-page colouring
 * interior with photographs is genuinely hundreds of megabytes — a measured
 * one is 268MB — and the limit cannot be small without breaking the main
 * thing this demo is for. What it can do is refuse the ones that are not
 * books. Two of these at once is the reason the machine is asked for 4GB.
 */
export const MAX_BODY_MB = int(process.env.MAX_EXPORT_BODY_MB, 400);
export const MAX_BODY_BYTES = MAX_BODY_MB * 1024 * 1024;

/**
 * The smallest thing that could be an export.
 *
 * A design with one text box is a couple of kilobytes; `{}` is two bytes. The
 * point is not to validate — the routes do that — but to refuse junk before
 * it is given a place in the render queue, since a request the route rejects
 * never reaches Chrome to give that place back.
 */
export const MIN_BODY_BYTES = int(process.env.MIN_EXPORT_BODY_BYTES, 256);

/** Five exports in ten minutes, per address. */
export const WINDOW_MS = int(process.env.EXPORT_WINDOW_MS, 10 * 60 * 1000);
export const PER_WINDOW = int(process.env.EXPORT_PER_WINDOW, 5);

/** What the health endpoint reports, so the limits in force are visible. */
export function exportLimits() {
  return {
    perWindow: PER_WINDOW,
    windowMinutes: Math.round(WINDOW_MS / 60000),
    maxBodyMb: MAX_BODY_MB,
    minBodyBytes: MIN_BODY_BYTES,
  };
}
