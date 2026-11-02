import { createDeck, cardKey, type Card } from './cards';
import { evaluate, HandCategory } from './evaluator';

/**
 * Pot odds. `pot` is the pot BEFORE you call, `toCall` is the amount you must put in.
 * `requiredEquity` is the minimum win probability for a call to break even.
 */
export function potOdds(pot: number, toCall: number) {
  if (pot < 0 || toCall <= 0) throw new Error('pot must be >= 0 and toCall > 0');
  return {
    requiredEquity: toCall / (pot + toCall),
    /** e.g. 3 means "3 to 1" */
    ratio: pot / toCall,
  };
}

/** Expected value (in chips) of calling, given your equity (0..1). */
export function callEV(pot: number, toCall: number, equity: number): number {
  return equity * pot - (1 - equity) * toCall;
}

/** Rule of 2 and 4: approximate equity (0..1) from the number of outs. */
export function ruleOf2And4(outs: number, cardsToCome: 1 | 2): number {
  return Math.min(1, (outs * (cardsToCome === 2 ? 4 : 2)) / 100);
}

export interface OutsOptions {
  /** Only count cards that make at least this category (e.g. Flush for a flush draw). */
  minCategory?: HandCategory;
}

/** Category the board alone shows (pairs/trips/quads only when fewer than 5 cards). */
function boardOnlyCategory(board: readonly Card[]): HandCategory {
  if (board.length >= 5) return evaluate(board).category;
  const counts = new Map<number, number>();
  for (const c of board) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  if (sizes[0] === 4) return HandCategory.FourOfAKind;
  if (sizes[0] === 3) return HandCategory.ThreeOfAKind;
  if (sizes[0] === 2 && sizes[1] === 2) return HandCategory.TwoPair;
  if (sizes[0] === 2) return HandCategory.Pair;
  return HandCategory.HighCard;
}

export interface Out {
  card: Card;
  /** The hand category the hero makes with this card. */
  category: HandCategory;
}

/**
 * Cards that improve the hero's hand category on the next card.
 * Works on the flop (3 board cards) or turn (4 board cards).
 * A card that only improves the board (e.g. pairs a board card, so everyone has
 * that pair) is not counted.
 * Note: this only looks at the hero's own hand, not at opponents' possible hands,
 * so a counted out may still lose to a better hand.
 */
export function countOuts(hole: readonly Card[], board: readonly Card[], options: OutsOptions = {}) {
  if (board.length < 3 || board.length > 4) throw new Error('Board must have 3 or 4 cards');
  const used = new Set([...hole, ...board].map(cardKey));
  const current = evaluate([...hole, ...board]).category;
  const details: Out[] = [];
  let unseen = 0;
  for (const card of createDeck()) {
    if (used.has(cardKey(card))) continue;
    unseen++;
    const next = evaluate([...hole, ...board, card]).category;
    const improved = next > current && next > boardOnlyCategory([...board, card]);
    const enough = options.minCategory === undefined || next >= options.minCategory;
    if (improved && enough) details.push({ card, category: next });
  }
  return {
    outs: details.map((d) => d.card),
    details,
    count: details.length,
    /** Exact chance of hitting at least one out by the river (flop: 2 cards, turn: 1 card). */
    hitProbability: hitProbability(details.length, unseen, board.length === 3 ? 2 : 1),
  };
}

/** Exact probability of drawing at least one of `outs` among `unseen` cards in `draws` draws. */
export function hitProbability(outs: number, unseen: number, draws: 1 | 2): number {
  if (draws === 1) return outs / unseen;
  const miss = ((unseen - outs) / unseen) * ((unseen - outs - 1) / (unseen - 1));
  return 1 - miss;
}
