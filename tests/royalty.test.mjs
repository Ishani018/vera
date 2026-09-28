import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRINT_COST,
  ROYALTY_TIERS,
  estimateRoyalty,
  money,
  printCost,
  royaltyRate,
} from '../lib/royalty.ts';

test('the printing figures carry the date they were read', () => {
  // The whole point of keeping them here is that someone can see how old they
  // are. A constant with no date is worse than no constant.
  assert.match(PRINT_COST.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(PRINT_COST.marketplace.length > 10);
});

test('a short book is charged a flat rate and a long one by the page', () => {
  assert.equal(printCost(24), PRINT_COST.flatRate);
  assert.equal(printCost(PRINT_COST.flatRatePages), PRINT_COST.flatRate);

  const long = printCost(300);
  assert.ok(long > PRINT_COST.flatRate);
  assert.ok(Math.abs(long - (PRINT_COST.fixed + PRINT_COST.perPage * 300)) < 1e-9);
});

test('printing never gets cheaper as a book gets longer', () => {
  let previous = 0;
  for (const pages of [24, 60, 108, 110, 200, 400, 828]) {
    const cost = printCost(pages);
    assert.ok(cost >= previous, `${pages} pages cost less than the book before it`);
    previous = cost;
  }
});

test('the royalty rate steps up at the threshold, not before it', () => {
  assert.equal(royaltyRate(ROYALTY_TIERS.highRateFrom - 0.01), ROYALTY_TIERS.lowRate);
  assert.equal(royaltyRate(ROYALTY_TIERS.highRateFrom), ROYALTY_TIERS.highRate);
  assert.equal(royaltyRate(19.99), ROYALTY_TIERS.highRate);
});

test('the estimate is the price, less Amazon, less printing', () => {
  const e = estimateRoyalty(12.99, 52);
  assert.equal(e.rate, 0.6);
  assert.equal(e.printing, PRINT_COST.flatRate);
  assert.ok(Math.abs(e.royalty - (12.99 * 0.6 - PRINT_COST.flatRate)) < 1e-9);
});

test('a price below the printing cost is reported as a loss, not as zero', () => {
  const e = estimateRoyalty(2, 52);
  assert.ok(e.royalty < 0, 'this really does lose money on every copy');
  assert.ok(e.breakEvenPrice > 2);
  // And at break-even it no longer does.
  assert.ok(estimateRoyalty(e.breakEvenPrice, 52).royalty >= -0.005);
});

test('break-even accounts for the lower rate below the threshold', () => {
  // A cheap short book breaks even under the threshold, where only half the
  // price is kept — dividing by the higher rate would understate it.
  const short = estimateRoyalty(1, 52);
  assert.ok(short.breakEvenPrice >= PRINT_COST.flatRate / ROYALTY_TIERS.lowRate - 0.011);

  // A long book cannot break even below the threshold at all, so the answer is
  // at least the threshold itself.
  const long = estimateRoyalty(1, 800);
  assert.ok(long.breakEvenPrice >= ROYALTY_TIERS.highRateFrom);
  assert.ok(estimateRoyalty(long.breakEvenPrice, 800).royalty >= -0.005);
});

test('the step up at the threshold is worth showing, and only below it', () => {
  const below = estimateRoyalty(9.98, 52);
  assert.ok(below.atHigherRate !== null);
  assert.ok(below.atHigherRate > below.royalty, 'a penny more is worth more than a penny');

  assert.equal(estimateRoyalty(9.99, 52).atHigherRate, null);
  assert.equal(estimateRoyalty(20, 52).atHigherRate, null);
});

test('money reads as money, including when it is a loss', () => {
  assert.equal(money(5), '$5.00');
  assert.equal(money(5.678), '$5.68');
  assert.equal(money(-1.5), '−$1.50');
  assert.equal(money(0), '$0.00');
});
