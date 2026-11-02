import type { Card } from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two pair',
  [HandCategory.ThreeOfAKind]: 'Three of a kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.FourOfAKind]: 'Four of a kind',
  [HandCategory.StraightFlush]: 'Straight flush',
};

export interface HandRank {
  category: HandCategory;
  /** Higher score = stronger hand. Equal scores = exact tie. */
  score: number;
  /** The 5 cards that make the hand. */
  cards: Card[];
  name: string;
}

const BASE = 15;

/** Evaluate exactly 5 cards. */
export function evaluate5(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) throw new Error('evaluate5 needs exactly 5 cards');

  const counts = new Array<number>(15).fill(0);
  for (const c of cards) counts[c.rank]!++;

  // Groups ordered by count desc, then rank desc. This gives the correct
  // tiebreak order for pairs, trips, full houses, etc.
  const groups: [rank: number, count: number][] = [];
  for (let r = 14; r >= 2; r--) if (counts[r]! > 0) groups.push([r, counts[r]!]);
  groups.sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const isFlush = cards.every((c) => c.suit === cards[0]!.suit);

  let straightHigh = 0;
  if (groups.length === 5) {
    const ranks = groups.map((g) => g[0]).sort((a, b) => b - a);
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5; // wheel A-2-3-4-5
  }

  const top = groups[0]![1];
  const second = groups[1]?.[1] ?? 0;

  let category: HandCategory;
  let tiebreak: number[];

  if (straightHigh && isFlush) {
    category = HandCategory.StraightFlush;
    tiebreak = [straightHigh];
  } else if (top === 4) {
    category = HandCategory.FourOfAKind;
    tiebreak = groups.map((g) => g[0]);
  } else if (top === 3 && second === 2) {
    category = HandCategory.FullHouse;
    tiebreak = groups.map((g) => g[0]);
  } else if (isFlush) {
    category = HandCategory.Flush;
    tiebreak = groups.map((g) => g[0]);
  } else if (straightHigh) {
    category = HandCategory.Straight;
    tiebreak = [straightHigh];
  } else if (top === 3) {
    category = HandCategory.ThreeOfAKind;
    tiebreak = groups.map((g) => g[0]);
  } else if (top === 2 && second === 2) {
    category = HandCategory.TwoPair;
    tiebreak = groups.map((g) => g[0]);
  } else if (top === 2) {
    category = HandCategory.Pair;
    tiebreak = groups.map((g) => g[0]);
  } else {
    category = HandCategory.HighCard;
    tiebreak = groups.map((g) => g[0]);
  }

  let score = category;
  for (let i = 0; i < 5; i++) score = score * BASE + (tiebreak[i] ?? 0);

  return { category, score, cards: cards.slice(), name: CATEGORY_NAMES[category] };
}

/** Best 5-card hand out of 5 to 7 cards. */
export function evaluate(cards: readonly Card[]): HandRank {
  const n = cards.length;
  if (n < 5 || n > 7) throw new Error('evaluate needs 5 to 7 cards');
  if (n === 5) return evaluate5(cards);

  let best: HandRank | null = null;
  const pick: Card[] = new Array(5);
  const recurse = (start: number, depth: number) => {
    if (depth === 5) {
      const r = evaluate5(pick);
      if (!best || r.score > best.score) best = r;
      return;
    }
    for (let i = start; i <= n - (5 - depth); i++) {
      pick[depth] = cards[i]!;
      recurse(i + 1, depth + 1);
    }
  };
  recurse(0, 0);
  return best!;
}

/** Positive if a is stronger, negative if b is stronger, 0 for a tie. */
export function compareHands(a: HandRank, b: HandRank): number {
  return a.score - b.score;
}

/** Returns the indices of the winning player(s). Multiple indices = split pot. */
export function findWinners(holes: readonly (readonly Card[])[], board: readonly Card[]): number[] {
  let bestScore = -1;
  let winners: number[] = [];
  holes.forEach((hole, i) => {
    const { score } = evaluate([...hole, ...board]);
    if (score > bestScore) {
      bestScore = score;
      winners = [i];
    } else if (score === bestScore) {
      winners.push(i);
    }
  });
  return winners;
}
