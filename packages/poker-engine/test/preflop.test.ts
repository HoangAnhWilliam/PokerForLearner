import { describe, expect, it } from 'vitest';
import { mulberry32, parseCards } from '../src/cards';
import {
  ALL_HAND_CLASSES,
  combosOf,
  gridHandClass,
  handClassCell,
  handClassOf,
  parseRange,
  randomCombo,
  rangeComboCount,
  rangePercent,
} from '../src/ranges';
import {
  actionFrequencies,
  correctAction,
  questionWeights,
  sampleQuestion,
  SPOTS_6MAX_100BB,
} from '../src/preflop';

const sorted = (s: Set<string>) => [...s].sort();
const spot = (id: string) => SPOTS_6MAX_100BB.find((s) => s.id === id)!;

describe('hand classes', () => {
  it('has 169 unique classes covering 1326 combos', () => {
    expect(new Set(ALL_HAND_CLASSES).size).toBe(169);
    expect(rangeComboCount(ALL_HAND_CLASSES)).toBe(1326);
  });
  it('grid layout: pairs on diagonal, suited above, offsuit below', () => {
    expect(gridHandClass(0, 0)).toBe('AA');
    expect(gridHandClass(0, 1)).toBe('AKs');
    expect(gridHandClass(1, 0)).toBe('AKo');
    expect(gridHandClass(12, 12)).toBe('22');
    for (const hc of ALL_HAND_CLASSES) {
      const { row, col } = handClassCell(hc);
      expect(gridHandClass(row, col)).toBe(hc);
    }
  });
  it('classifies hole cards', () => {
    const [a, b] = parseCards('Kd As');
    expect(handClassOf(a!, b!)).toBe('AKo');
    const [c, d] = parseCards('7h 8h');
    expect(handClassOf(c!, d!)).toBe('87s');
    const [e, f] = parseCards('Tc Td');
    expect(handClassOf(e!, f!)).toBe('TT');
  });
  it('combos and random combos match their class', () => {
    expect(combosOf('AA').length).toBe(6);
    expect(combosOf('AKs').length).toBe(4);
    expect(combosOf('AKo').length).toBe(12);
    const rng = mulberry32(3);
    for (const hc of ['QQ', 'T9s', 'A2o']) {
      for (let i = 0; i < 20; i++) {
        const [x, y] = randomCombo(hc, rng);
        expect(handClassOf(x, y)).toBe(hc);
      }
    }
  });
});

describe('parseRange', () => {
  it('pairs', () => {
    expect(sorted(parseRange('QQ+'))).toEqual(['AA', 'KK', 'QQ']);
    expect(parseRange('22-55').size).toBe(4);
    expect(parseRange('55-22').size).toBe(4);
  });
  it('plus notation keeps the top card and raises the kicker', () => {
    expect(sorted(parseRange('ATs+'))).toEqual(['AJs', 'AKs', 'AQs', 'ATs']);
    expect(sorted(parseRange('KJo+'))).toEqual(['KJo', 'KQo']);
  });
  it('dash ranges in either order', () => {
    expect(sorted(parseRange('A2s-A5s'))).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
    expect(sorted(parseRange('A5s-A2s'))).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
  });
  it('no suffix means suited and offsuit, and is case-insensitive', () => {
    expect(sorted(parseRange('kq'))).toEqual(['KQo', 'KQs']);
    expect(sorted(parseRange('ats+'))).toEqual(['AJs', 'AKs', 'AQs', 'ATs']);
  });
  it('accepts the low card first', () => {
    expect(sorted(parseRange('KAs'))).toEqual(['AKs']);
  });
  it('rejects nonsense', () => {
    expect(() => parseRange('AXs')).toThrow();
    expect(() => parseRange('AAs')).toThrow();
    expect(() => parseRange('A5s-K2s')).toThrow();
  });
  it('percent of all hands', () => {
    expect(rangePercent(parseRange('AA'))).toBeCloseTo(6 / 1326);
  });
});

describe('6-max charts', () => {
  it('every chart parses', () => {
    for (const s of SPOTS_6MAX_100BB) {
      expect(() => parseRange(s.ranges.raise)).not.toThrow();
      if (s.ranges.call) expect(() => parseRange(s.ranges.call!)).not.toThrow();
    }
  });
  it('opening ranges widen from UTG to BTN', () => {
    const open = ['rfi-utg', 'rfi-hj', 'rfi-co', 'rfi-btn'].map((id) => actionFrequencies(spot(id)).raise);
    for (let i = 1; i < open.length; i++) expect(open[i]!).toBeGreaterThan(open[i - 1]!);
  });
  it('each opening range contains the previous position range', () => {
    const ids = ['rfi-utg', 'rfi-hj', 'rfi-co', 'rfi-btn'];
    for (let i = 1; i < ids.length; i++) {
      const tighter = parseRange(spot(ids[i - 1]!).ranges.raise);
      const wider = parseRange(spot(ids[i]!).ranges.raise);
      for (const hc of tighter) expect(wider.has(hc), `${hc} in ${ids[i]}`).toBe(true);
    }
  });
  it('raise and call ranges do not overlap', () => {
    for (const s of SPOTS_6MAX_100BB) {
      if (!s.ranges.call) continue;
      const raise = parseRange(s.ranges.raise);
      for (const hc of parseRange(s.ranges.call)) expect(raise.has(hc), `${s.id}: ${hc}`).toBe(false);
    }
  });
  it('sanity checks on well-known hands', () => {
    for (const s of SPOTS_6MAX_100BB) {
      expect(correctAction(s, 'AA')).toBe('raise');
      expect(correctAction(s, 'AKs')).toBe('raise');
      expect(correctAction(s, '72o')).toBe('fold');
    }
    expect(correctAction(spot('rfi-utg'), '22')).toBe('fold');
    expect(correctAction(spot('rfi-btn'), '22')).toBe('raise');
    expect(correctAction(spot('bb-vs-btn'), '87s')).toBe('call');
    expect(correctAction(spot('bb-vs-utg'), 'K9o')).toBe('fold');
  });
});

describe('question sampling', () => {
  it('boundary hands get more weight than obvious folds', () => {
    const w = questionWeights(spot('rfi-utg'));
    // 55 sits just outside 66+, 72o is a trivial fold; both have 6 / 12 combos
    expect(w.get('55')! / 6).toBeGreaterThan(w.get('72o')! / 12);
  });
  it('produces questions whose cards match the hand and answer', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const q = sampleQuestion(SPOTS_6MAX_100BB, rng);
      expect(handClassOf(q.cards[0], q.cards[1])).toBe(q.hand);
      expect(q.answer).toBe(correctAction(q.spot, q.hand));
      expect(q.spot.actions).toContain(q.answer);
    }
  });
});
