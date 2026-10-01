import assert from 'node:assert/strict';
import test from 'node:test';

import { SWITCH, switchReach, switchTravel } from '../lib/switch.ts';

/**
 * The switch's knob must stay inside its track.
 *
 * It did not: the knob was positioned from its static position rather than
 * from the track's left edge, so it hung two pixels past the right end when
 * off and twenty-two past it when on. The numbers themselves were always
 * right — what was missing was a `left`. These guard the numbers, and a
 * browser check measures the real boxes; both are needed, because each misses
 * what the other catches.
 */

test('the knob fits inside the track at rest', () => {
  const { inset, knob, trackWidth, trackHeight } = SWITCH;
  assert.ok(inset >= 1, 'there is a gap at the left');
  assert.ok(inset + knob <= trackWidth, `${inset + knob} must not exceed ${trackWidth}`);
  assert.ok(inset + knob <= trackHeight + inset, 'and it is not taller than the track');
  assert.equal(inset + knob + inset, trackHeight, 'the knob is centred vertically by the inset');
});

test('and at the far end of its travel', () => {
  const { inset, knob, trackWidth } = SWITCH;
  const right = inset + switchTravel() + knob;
  assert.ok(right <= trackWidth, `the knob ends at ${right}, past the track at ${trackWidth}`);
  assert.equal(right, trackWidth - inset, 'with the same gap it had at the other end');
});

test('the travel is what is left over, and is worth seeing', () => {
  assert.equal(switchTravel(), SWITCH.trackWidth - 2 * SWITCH.inset - SWITCH.knob);
  assert.ok(switchTravel() >= 12, `${switchTravel()}px of travel is enough to read as a slide`);
});

test('a knob too wide for its track has nowhere to go, and says so', () => {
  // `inset + travel + knob` can never exceed the track, because travel *is* the
  // leftover — so that sum is not what to guard. What a too-wide knob does is
  // leave a negative amount of room, which is the thing to catch.
  const tooWide = { trackWidth: 50, trackHeight: 30, inset: 3, knob: 48, touchTarget: 44 };
  assert.ok(switchTravel(tooWide) < 0, `${switchTravel(tooWide)}px of travel is impossible`);
  assert.ok(switchTravel() > 0, 'where the real one has room to move');

  const tooTall = { ...SWITCH, knob: 40 };
  assert.ok(tooTall.knob + 2 * tooTall.inset > tooTall.trackHeight, 'and a tall knob overflows upward');
});

test('the touch target is at least the size of a finger', () => {
  assert.ok(SWITCH.touchTarget >= 44, `${SWITCH.touchTarget}px`);
  assert.ok(SWITCH.trackWidth >= 44, 'the track is already wide enough on its own');
  assert.ok(SWITCH.trackHeight < SWITCH.touchTarget, 'but not tall enough, which is why it reaches out');
  assert.equal(SWITCH.trackHeight + 2 * switchReach(), SWITCH.touchTarget, 'and reaches exactly far enough');
  assert.equal(switchReach({ ...SWITCH, trackHeight: 60 }), 0, 'a tall enough track reaches nowhere');
});
