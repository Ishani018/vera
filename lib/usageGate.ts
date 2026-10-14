'use client';

const STORAGE_KEY_USAGE = 'vera_usage_count';
const STORAGE_KEY_SINCE_MODAL = 'vera_actions_since_modal';
const STORAGE_KEY_SUBMITTED = 'vera_beta_submitted';
const STORAGE_KEY_SNOOZE = 'vera_gate_snooze_until';

// User requirement: Exactly 2 creation actions (e.g. 2 stickers, or subtitle + split, or export)
export const DEFAULT_USAGE_THRESHOLD = 2;

export interface UsageStatus {
  count: number;
  actionsSinceModal: number;
  threshold: number;
  isSubmitted: boolean;
  isSnoozed: boolean;
  shouldPrompt: boolean;
  lastAction?: string;
}

export function getUsageStatus(threshold = DEFAULT_USAGE_THRESHOLD): UsageStatus {
  if (typeof window === 'undefined') {
    return { count: 0, actionsSinceModal: 0, threshold, isSubmitted: false, isSnoozed: false, shouldPrompt: false };
  }

  try {
    const isSubmitted = localStorage.getItem(STORAGE_KEY_SUBMITTED) === 'true';
    const count = parseInt(localStorage.getItem(STORAGE_KEY_USAGE) || '0', 10);
    const actionsSinceModal = parseInt(localStorage.getItem(STORAGE_KEY_SINCE_MODAL) || count.toString(), 10);
    const snoozeUntil = parseInt(localStorage.getItem(STORAGE_KEY_SNOOZE) || '0', 10);
    
    // Clear snooze if expired or stale (longer than 10 mins)
    const isSnoozed = Date.now() < snoozeUntil;

    // Trigger when 2 creation actions have occurred since last prompt, or total count >= threshold
    const shouldPrompt = !isSubmitted && (!isSnoozed || actionsSinceModal >= threshold) && (actionsSinceModal >= threshold || count >= threshold);
    return { count, actionsSinceModal, threshold, isSubmitted, isSnoozed, shouldPrompt };
  } catch {
    return { count: 0, actionsSinceModal: 0, threshold, isSubmitted: false, isSnoozed: false, shouldPrompt: false };
  }
}

export function recordUsageAction(actionName = 'action', threshold = DEFAULT_USAGE_THRESHOLD): UsageStatus {
  if (typeof window === 'undefined') {
    return { count: 0, actionsSinceModal: 0, threshold, isSubmitted: false, isSnoozed: false, shouldPrompt: false };
  }

  try {
    const isSubmitted = localStorage.getItem(STORAGE_KEY_SUBMITTED) === 'true';
    const currentCount = parseInt(localStorage.getItem(STORAGE_KEY_USAGE) || '0', 10);
    const nextCount = currentCount + 1;
    localStorage.setItem(STORAGE_KEY_USAGE, nextCount.toString());

    const currentSince = parseInt(localStorage.getItem(STORAGE_KEY_SINCE_MODAL) || '0', 10);
    const nextSince = currentSince + 1;
    localStorage.setItem(STORAGE_KEY_SINCE_MODAL, nextSince.toString());

    // Exporting or reaching threshold triggers the modal immediately
    const isExport = actionName.startsWith('export');
    const reachedThreshold = nextSince >= threshold || nextCount >= threshold;
    const shouldPrompt = !isSubmitted && (isExport || reachedThreshold);

    const status: UsageStatus = {
      count: nextCount,
      actionsSinceModal: nextSince,
      threshold,
      isSubmitted,
      isSnoozed: false,
      shouldPrompt,
      lastAction: actionName,
    };

    // If threshold reached or export, clear any snooze so user is prompted right now
    if (shouldPrompt) {
      localStorage.removeItem(STORAGE_KEY_SNOOZE);
    }

    // Always notify listeners of usage action update
    window.dispatchEvent(
      new CustomEvent('vera:usage_updated', {
        detail: status,
      }),
    );

    // If prompt conditions are met, trigger modal directly
    if (shouldPrompt) {
      window.dispatchEvent(
        new CustomEvent('vera:open_beta_modal', {
          detail: { reason: actionName, count: nextCount },
        }),
      );
    }

    return status;
  } catch {
    return { count: 0, actionsSinceModal: 0, threshold, isSubmitted: false, isSnoozed: false, shouldPrompt: false };
  }
}

export function markBetaSubmitted(email: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SUBMITTED, 'true');
    localStorage.setItem('vera_beta_email', email);
    localStorage.removeItem(STORAGE_KEY_SINCE_MODAL);
    window.dispatchEvent(new CustomEvent('vera:usage_updated'));
  } catch {}
}

export function snoozeGate(minutes = 10) {
  if (typeof window === 'undefined') return;
  try {
    // Reset actions since modal so user needs 2 more creation actions to trigger again
    localStorage.setItem(STORAGE_KEY_SINCE_MODAL, '0');
    const snoozeUntil = Date.now() + minutes * 60 * 1000;
    localStorage.setItem(STORAGE_KEY_SNOOZE, snoozeUntil.toString());
    window.dispatchEvent(new CustomEvent('vera:usage_updated'));
  } catch {}
}

export function resetUsageGate() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_USAGE);
    localStorage.removeItem(STORAGE_KEY_SINCE_MODAL);
    localStorage.removeItem(STORAGE_KEY_SUBMITTED);
    localStorage.removeItem(STORAGE_KEY_SNOOZE);
    window.dispatchEvent(new CustomEvent('vera:usage_updated'));
  } catch {}
}

