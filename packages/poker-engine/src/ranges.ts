import { createDeck, parseCard, type Card, type Rng } from './cards';

/**
 * A starting-hand class, e.g. "AA", "AKs" (suited), "AKo" (offsuit).
 * There are 169 classes: 13 pairs, 78 suited, 78 offsuit.
 */
export type HandClass = string;

/** Ranks from high to low, the order used in 13x13 grids. */
export const GRID_RANKS = 'AKQJT98765432';

const rankIndex = (r: string) => {
  const i = GRID_RANKS.indexOf(r);
  if (i < 0) throw new Error(`Invalid rank "${r}"`);
  return i;
};

/**
 * Hand class at grid cell (row, col).
 * Diagonal = pairs, above the diagonal = suited, below = offsuit.
 */
export function gridHandClass(row: number, col: number): HandClass {
  const a = GRID_RANKS[row]!;
  const b = GRID_RANKS[col]!;
  if (row === col) return a + b;
  return row < col ? `${a}${b}s` : `${b}${a}o`;
}

/** All 169 hand classes in grid order (row by row). */
export const ALL_HAND_CLASSES: readonly HandClass[] = Array.from({ length: 169 }, (_, i) =>
  gridHandClass(Math.floor(i / 13), i % 13),
);

/** Grid position of a hand class. */
export function handClassCell(hc: HandClass): { row: number; col: number } {
  const hi = rankIndex(hc[0]!);
  const lo = rankIndex(hc[1]!);
  if (hc.length === 2) return { row: hi, col: hi };
  return hc[2] === 's' ? { row: hi, col: lo } : { row: lo, col: hi };
}

const RANK_CHAR = (rank: number) => '23456789TJQKA'[rank - 2]!;

/** Hand class of two hole cards, e.g. As Kd -> "AKo". */
export function handClassOf(a: Card, b: Card): HandClass {
  const [hi, lo] = a.rank >= b.rank ? [a, b] : [b, a];
  if (hi.rank === lo.rank) return RANK_CHAR(hi.rank) + RANK_CHAR(lo.rank);
  return RANK_CHAR(hi.rank) + RANK_CHAR(lo.rank) + (hi.suit === lo.suit ? 's' : 'o');
}

/** Number of card combinations: pairs 6, suited 4, offsuit 12. */
export function comboCount(hc: HandClass): number {
  if (hc.length === 2) return 6;
  return hc[2] === 's' ? 4 : 12;
}

/** Every concrete 2-card combination of a hand class. */
export function combosOf(hc: HandClass): [Card, Card][] {
  const deck = createDeck();
  const out: [Card, Card][] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (handClassOf(deck[i]!, deck[j]!) === hc) out.push([deck[i]!, deck[j]!]);
    }
  }
  return out;
}

/** A random concrete combo of a hand class, high card first. */
export function randomCombo(hc: HandClass, rng: Rng = Math.random): [Card, Card] {
  const suits = ['s', 'h', 'd', 'c'];
  const s1 = suits[Math.floor(rng() * 4)]!;
  let s2 = s1;
  if (hc.length === 2 || hc[2] === 'o') {
    const others = suits.filter((s) => s !== s1);
    s2 = others[Math.floor(rng() * 3)]!;
  }
  return [parseCard(hc[0]! + s1), parseCard(hc[1]! + s2)];
}

/**
 * Parse standard range notation into a set of hand classes.
 * Supported tokens (comma separated):
 *   QQ        a pair
 *   77+       pairs 77 and higher
 *   22-99     pairs from 22 to 99
 *   AKs AKo   suited / offsuit hand
 *   AK        both suited and offsuit
 *   ATs+      ATs, AJs, AQs, AKs (kicker goes up, top card fixed)
 *   A2s-A5s   A2s to A5s (either order)
 */
export function parseRange(text: string): Set<HandClass> {
  const result = new Set<HandClass>();
  const tokens = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  for (const raw of tokens) {
    const token = raw
      .toUpperCase()
      .replace(/([2-9TJQKA]{2})([SO])/g, (_, ranks: string, s: string) => ranks + s.toLowerCase());

    // Ranges with a dash
    const dash = token.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)-([2-9TJQKA])([2-9TJQKA])([so]?)$/);
    if (dash) {
      const [, a1, b1, s1, a2, b2, s2] = dash as unknown as string[];
      if (s1 !== s2) throw new Error(`Invalid range token "${raw}"`);
      if (a1 === b1 && a2 === b2) {
        // pair range 22-99
        const [from, to] = [rankIndex(a1!), rankIndex(a2!)].sort((x, y) => y - x);
        for (let i = from!; i >= to!; i--) result.add(GRID_RANKS[i]! + GRID_RANKS[i]!);
        continue;
      }
      if (a1 !== a2) throw new Error(`Invalid range token "${raw}": top card must match`);
      const top = rankIndex(a1!);
      const [from, to] = [rankIndex(b1!), rankIndex(b2!)].sort((x, y) => y - x);
      if (to! <= top) throw new Error(`Invalid range token "${raw}"`);
      for (let i = from!; i >= to!; i--) addNonPair(result, a1!, GRID_RANKS[i]!, s1!);
      continue;
    }

    const single = token.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)$/);
    if (!single) throw new Error(`Invalid range token "${raw}"`);
    let [, a, b, suit, plus] = single as unknown as string[];

    if (a === b) {
      if (suit) throw new Error(`Invalid range token "${raw}": pairs have no suit`);
      const idx = rankIndex(a!);
      const stop = plus ? 0 : idx;
      for (let i = idx; i >= stop; i--) result.add(GRID_RANKS[i]! + GRID_RANKS[i]!);
      continue;
    }

    if (rankIndex(a!) > rankIndex(b!)) [a, b] = [b, a];
    if (plus) {
      const top = rankIndex(a!);
      for (let i = rankIndex(b!); i > top; i--) addNonPair(result, a!, GRID_RANKS[i]!, suit!);
    } else {
      addNonPair(result, a!, b!, suit!);
    }
  }
  return result;
}

function addNonPair(set: Set<HandClass>, hi: string, lo: string, suit: string) {
  if (suit !== 'o') set.add(`${hi}${lo}s`);
  if (suit !== 's') set.add(`${hi}${lo}o`);
}

/** Total combos in a set of hand classes. */
export function rangeComboCount(range: Iterable<HandClass>): number {
  let n = 0;
  for (const hc of range) n += comboCount(hc);
  return n;
}

/** Share of all 1326 starting hands, 0..1. */
export function rangePercent(range: Iterable<HandClass>): number {
  return rangeComboCount(range) / 1326;
}
