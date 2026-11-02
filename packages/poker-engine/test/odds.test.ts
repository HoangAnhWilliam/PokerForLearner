import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/cards';
import { HandCategory } from '../src/evaluator';
import { callEV, countOuts, potOdds, ruleOf2And4 } from '../src/odds';
import { equity } from '../src/equity';
import { mulberry32 } from '../src/cards';

describe('pot odds', () => {
  it('calculates required equity', () => {
    // pot 100, call 50 -> need 50 / 150
    expect(potOdds(100, 50).requiredEquity).toBeCloseTo(1 / 3);
    expect(potOdds(100, 50).ratio).toBe(2);
  });
  it('EV of a call is zero at break-even equity', () => {
    expect(callEV(100, 50, 1 / 3)).toBeCloseTo(0);
    expect(callEV(100, 50, 0.5)).toBeGreaterThan(0);
  });
  it('rule of 2 and 4', () => {
    expect(ruleOf2And4(9, 2)).toBeCloseTo(0.36);
    expect(ruleOf2And4(9, 1)).toBeCloseTo(0.18);
  });
});

describe('countOuts', () => {
  it('flush draw has 9 outs', () => {
    const r = countOuts(parseCards('Ah Kh'), parseCards('2h 7h 9c'), { minCategory: HandCategory.Flush });
    expect(r.count).toBe(9);
  });
  it('open-ended straight draw has 8 outs', () => {
    const r = countOuts(parseCards('8h 9d'), parseCards('6c 7s Kd'), { minCategory: HandCategory.Straight });
    expect(r.count).toBe(8);
  });
  it('gutshot has 4 outs', () => {
    const r = countOuts(parseCards('8h 9d'), parseCards('5c 7s Kd'), { minCategory: HandCategory.Straight });
    expect(r.count).toBe(4);
  });
  it('does not count cards that only pair the board', () => {
    // 9 hearts + 3 aces + 3 kings; pairing 2, 7 or 9 on the board is not an out
    const r = countOuts(parseCards('Ah Kh'), parseCards('2h 7h 9c'));
    expect(r.count).toBe(15);
  });
  it('groups outs by the hand they make', () => {
    const r = countOuts(parseCards('As Ks'), parseCards('Qs Js 2d'));
    const by = (c: HandCategory) => r.details.filter((d) => d.category === c).length;
    expect(by(HandCategory.StraightFlush)).toBe(1); // Ts
    expect(by(HandCategory.Flush)).toBe(8);
    expect(by(HandCategory.Straight)).toBe(3);
    expect(by(HandCategory.Pair)).toBe(6); // A or K; Q/J only pair the board
    expect(r.count).toBe(18);
  });
  it('exact hit probability: 9 outs on the flop is about 35%', () => {
    const r = countOuts(parseCards('Ah Kh'), parseCards('2h 7h 9c'), { minCategory: HandCategory.Flush });
    expect(r.hitProbability).toBeCloseTo(1 - (38 / 47) * (37 / 46), 6);
  });
  it('rejects a preflop or river board', () => {
    expect(() => countOuts(parseCards('Ah Kh'), [])).toThrow();
  });
});

describe('equity', () => {
  it('a made royal flush on a full board has 100% equity', () => {
    const r = equity({
      players: [parseCards('As Ah'), parseCards('2c 3d')],
      board: parseCards('Ad Ac Ks Kd 9h'),
    });
    expect(r.exact).toBe(true);
    expect(r.equities[0]).toBe(1);
  });
  it('a shared board splits 50/50', () => {
    const r = equity({
      players: [parseCards('2c 3d'), parseCards('4h 5h')],
      board: parseCards('As Ks Qs Js Ts'),
    });
    expect(r.equities).toEqual([0.5, 0.5]);
  });
  it('enumerates exactly on the turn and sums to 1', () => {
    const r = equity({
      players: [parseCards('As Ks'), parseCards('9h 9d')],
      board: parseCards('Qs Js 2d 3c'),
    });
    expect(r.exact).toBe(true);
    expect(r.samples).toBe(44);
    expect(r.equities[0]! + r.equities[1]!).toBeCloseTo(1);
  });
  it('AA vs KK preflop is about 82% (Monte Carlo)', () => {
    const r = equity({
      players: [parseCards('As Ah'), parseCards('Ks Kh')],
      iterations: 20000,
      rng: mulberry32(42),
    });
    expect(r.exact).toBe(false);
    expect(r.equities[0]!).toBeGreaterThan(0.79);
    expect(r.equities[0]!).toBeLessThan(0.85);
  });
  it('AA vs a random hand is about 85%', () => {
    const r = equity({
      players: [parseCards('As Ah'), null],
      iterations: 20000,
      rng: mulberry32(7),
    });
    expect(r.equities[0]!).toBeGreaterThan(0.83);
    expect(r.equities[0]!).toBeLessThan(0.88);
  });
  it('rejects duplicate cards', () => {
    expect(() => equity({ players: [parseCards('As Ah'), parseCards('As Kh')] })).toThrow();
  });
});
