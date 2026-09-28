import type { PaperType } from './kdp';

/**
 * What a paperback earns, near enough to plan with.
 *
 * Every number here is Amazon's, not ours, and Amazon changes them. They are
 * therefore kept as dated constants in one place rather than scattered through
 * the interface, and the interface says the date out loud. Treat the result as
 * an estimate to decide a price with, never as an accounting figure.
 */

/**
 * KDP's printing cost for a black-ink paperback in the US marketplace.
 *
 * Read off KDP's own printing-cost calculator on the date below. If that date
 * is old, open the calculator again and change these three numbers: nothing
 * else in the app needs touching.
 */
export const PRINT_COST = {
  /** When these figures were last checked against KDP's calculator. */
  updated: '2026-09-28',
  marketplace: 'Amazon.com · paperback · black ink on white or cream paper',
  /**
   * The paper stocks these figures cover. Colour printing is charged on an
   * entirely different scale - several times this, and per page rather than
   * flat - so a book set to print in colour is not estimated at all rather
   * than estimated wrongly.
   */
  papers: ['white', 'cream'] as const,
  /** Books at or under this length are charged a flat rate. */
  flatRatePages: 108,
  flatRate: 2.3,
  /** Longer books: a fixed charge plus so much a page. */
  fixed: 1.0,
  perPage: 0.012,
};

/** True when the figures above apply to the stock this book prints on. */
export function printCostKnown(paper: PaperType): boolean {
  return (PRINT_COST.papers as readonly string[]).includes(paper);
}

/** What KDP charges to print one copy of a black-ink book this long. */
export function printCost(pageCount: number): number {
  const pages = Math.max(1, Math.round(pageCount));
  return pages <= PRINT_COST.flatRatePages
    ? PRINT_COST.flatRate
    : PRINT_COST.fixed + PRINT_COST.perPage * pages;
}

/**
 * The royalty rate. Amazon pays the higher rate only from a threshold price
 * upwards, which is the single most useful thing to know when setting one:
 * a book priced a penny under it earns a sixth less on every copy.
 */
export const ROYALTY_TIERS = {
  highRateFrom: 9.99,
  highRate: 0.6,
  lowRate: 0.5,
};

export function royaltyRate(listPrice: number): number {
  return listPrice >= ROYALTY_TIERS.highRateFrom ? ROYALTY_TIERS.highRate : ROYALTY_TIERS.lowRate;
}

export type RoyaltyEstimate = {
  listPrice: number;
  rate: number;
  printing: number;
  /** What lands in the bank per copy. Negative means the price is too low. */
  royalty: number;
  /** The lowest price at which this book does not lose money on every copy. */
  breakEvenPrice: number;
  /**
   * What the same book would earn a penny above the higher-rate threshold.
   * Null when the price is already at or above it.
   */
  atHigherRate: number | null;
};

export function estimateRoyalty(listPrice: number, pageCount: number): RoyaltyEstimate {
  const price = Math.max(0, listPrice);
  const rate = royaltyRate(price);
  const printing = printCost(pageCount);
  const royalty = price * rate - printing;

  // Below the threshold the rate is lower, so break-even is further away; the
  // two cases have to be worked out separately rather than divided once.
  const lowBreak = printing / ROYALTY_TIERS.lowRate;
  const breakEvenPrice =
    lowBreak < ROYALTY_TIERS.highRateFrom
      ? lowBreak
      : Math.max(ROYALTY_TIERS.highRateFrom, printing / ROYALTY_TIERS.highRate);

  return {
    listPrice: price,
    rate,
    printing,
    royalty,
    breakEvenPrice: Math.ceil(breakEvenPrice * 100) / 100,
    atHigherRate:
      price < ROYALTY_TIERS.highRateFrom
        ? ROYALTY_TIERS.highRateFrom * ROYALTY_TIERS.highRate - printing
        : null,
  };
}

export const money = (value: number) =>
  `${value < 0 ? '−' : ''}$${Math.abs(value).toFixed(2)}`;
