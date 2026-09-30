/**
 * Asking the browser not to throw the work away.
 *
 * Everything this app makes lives in IndexedDB, and IndexedDB is not a safe
 * place by default. Chrome evicts it when the disk gets tight. Safari evicts
 * it after seven days without a visit — which is the one that will actually
 * bite, because trying a demo once and coming back the following week is
 * exactly how someone tries a demo.
 *
 * `navigator.storage.persist()` asks for an exemption. Browsers answer it by
 * their own rules: Firefox prompts, Chrome grants it silently to sites the
 * person engages with and refuses otherwise, Safari grants it on much the
 * same basis. So this is a request and never a guarantee, and nothing here
 * depends on the answer — it is asked once, the answer is remembered so the
 * interface can be honest about it, and the app carries on either way.
 *
 * Asked on the first save rather than on load, deliberately: a browser
 * weighing whether a site matters to someone counts what they have done on
 * it, and the moment they have made something is the moment the answer is
 * most likely to be yes.
 */

/** Written so the interface can say which way it went. A new key; none moved. */
export const PERSIST_KEY = 'versecraft:persisted';

export type PersistState = 'granted' | 'refused' | 'unsupported' | 'unknown';

let asked = false;

/** What was decided last time, without asking again. */
export function persistedState(): PersistState {
  try {
    const seen = window.localStorage.getItem(PERSIST_KEY);
    if (seen === 'granted' || seen === 'refused' || seen === 'unsupported') return seen;
  } catch {
    /* storage unavailable: a private window, or site data blocked */
  }
  return 'unknown';
}

/**
 * Asks once per page, and at most once ever after a clear answer.
 *
 * A refusal is worth re-asking on a later visit — the browser's mind changes
 * as someone uses a site more — so only a grant is treated as final.
 */
export async function askToPersist(): Promise<PersistState> {
  if (asked) return persistedState();
  asked = true;

  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    remember('unsupported');
    return 'unsupported';
  }
  if (persistedState() === 'granted') return 'granted';

  try {
    // Already granted on an earlier visit: asking again would be a second
    // prompt in the browsers that prompt.
    if (await navigator.storage.persisted?.()) {
      remember('granted');
      return 'granted';
    }
    const granted = await navigator.storage.persist();
    remember(granted ? 'granted' : 'refused');
    return granted ? 'granted' : 'refused';
  } catch {
    remember('unsupported');
    return 'unsupported';
  }
}

function remember(state: PersistState): void {
  try {
    window.localStorage.setItem(PERSIST_KEY, state);
  } catch {
    /* Knowing is a convenience; not knowing is not an error. */
  }
}

/** Roughly how much room the browser is willing to give, for the notice. */
export async function storageRoom(): Promise<{ usedMb: number; quotaMb: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) return null;
    return {
      usedMb: Math.round((estimate.usage ?? 0) / 1024 / 1024),
      quotaMb: Math.round(estimate.quota / 1024 / 1024),
    };
  } catch {
    return null;
  }
}
