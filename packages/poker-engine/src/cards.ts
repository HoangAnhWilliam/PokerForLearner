export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/** Random number generator returning a float in [0, 1). Injectable for tests. */
export type Rng = () => number;

const RANK_CHARS = '23456789TJQKA';

export function parseCard(text: string): Card {
  const t = text.trim();
  if (t.length !== 2) throw new Error(`Invalid card: "${text}"`);
  const idx = RANK_CHARS.indexOf(t[0]!.toUpperCase());
  const suit = t[1]!.toLowerCase() as Suit;
  if (idx < 0 || !SUITS.includes(suit)) throw new Error(`Invalid card: "${text}"`);
  return { rank: (idx + 2) as Rank, suit };
}

/** Parses "As Kd", "AsKd" or "As,Kd" into cards. */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Invalid cards: "${text}"`);
  const out: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) out.push(parseCard(compact.slice(i, i + 2)));
  return out;
}

export function cardToString(card: Card): string {
  return RANK_CHARS[card.rank - 2]! + card.suit;
}

export function cardsToString(cards: readonly Card[]): string {
  return cards.map(cardToString).join(' ');
}

export function cardKey(card: Card): number {
  return card.rank * 4 + SUITS.indexOf(card.suit);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank: rank as Rank, suit });
  }
  return deck;
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Small deterministic PRNG, useful for reproducible tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
