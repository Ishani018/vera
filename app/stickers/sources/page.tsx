import { redirect } from 'next/navigation';

/**
 * The old address of this page.
 *
 * Kept as a redirect rather than deleted: it was linked from the Packs page and
 * may be in somebody's history, and a dead link is a worse answer than the page
 * it moved to.
 */
export default function Page() {
  redirect('/stickers/library');
}
