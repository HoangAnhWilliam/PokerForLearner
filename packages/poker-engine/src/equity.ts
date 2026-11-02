import { createDeck, cardKey, type Card, type Rng } from './cards';
import { evaluate } from './evaluator';

export interface EquityInput {
  /** Known hole cards (2 cards), or null for a random hand. */
  players: (readonly Card[] | null)[];
  /** 0 to 5 known community cards. */
  board?: readonly Card[];
  /** Monte Carlo iterations when enumeration is not feasible. Default 20000. */
  iterations?: number;
  rng?: Rng;
  /** Max number of board combinations to enumerate exactly. Default 250000. */
  maxEnumeration?: number;
}

export interface EquityResult {
  /** Win probability with ties split, per player. Sums to 1. */
  equities: number[];
  wins: number[];
  ties: number[];
  samples: number;
  exact: boolean;
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export function equity(input: EquityInput): EquityResult {
  const board = input.board ?? [];
  const players = input.players;
  if (players.length < 2) throw new Error('Need at least 2 players');
  if (board.length > 5) throw new Error('Board has more than 5 cards');
  for (const p of players) if (p && p.length !== 2) throw new Error('Hole cards must be 2 cards');

  const dead = new Set<number>();
  for (const c of [...board, ...players.flatMap((p) => p ?? [])]) {
    const k = cardKey(c);
    if (dead.has(k)) throw new Error('Duplicate card');
    dead.add(k);
  }
  const remaining = createDeck().filter((c) => !dead.has(cardKey(c)));

  const randomCount = players.filter((p) => p === null).length;
  const need = 5 - board.length;
  const n = players.length;
  const wins = new Array<number>(n).fill(0);
  const ties = new Array<number>(n).fill(0);
  const share = new Array<number>(n).fill(0);
  let samples = 0;

  const resolve = (holes: (readonly Card[])[], fullBoard: readonly Card[]) => {
    let best = -1;
    let winners: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = evaluate([...holes[i]!, ...fullBoard]).score;
      if (s > best) {
        best = s;
        winners = [i];
      } else if (s === best) winners.push(i);
    }
    for (const w of winners) {
      share[w]! += 1 / winners.length;
      if (winners.length === 1) wins[w]!++;
      else ties[w]!++;
    }
    samples++;
  };

  const maxEnum = input.maxEnumeration ?? 250000;
  const exact = randomCount === 0 && combinations(remaining.length, need) <= maxEnum;

  if (exact) {
    const holes = players as (readonly Card[])[];
    const extra: Card[] = new Array(need);
    const recurse = (start: number, depth: number) => {
      if (depth === need) {
        resolve(holes, [...board, ...extra]);
        return;
      }
      for (let i = start; i <= remaining.length - (need - depth); i++) {
        extra[depth] = remaining[i]!;
        recurse(i + 1, depth + 1);
      }
    };
    recurse(0, 0);
  } else {
    const rng = input.rng ?? Math.random;
    const iterations = input.iterations ?? 20000;
    const pool = remaining.slice();
    const drawCount = need + randomCount * 2;
    for (let it = 0; it < iterations; it++) {
      // Partial Fisher-Yates: move `drawCount` random cards to the front.
      for (let i = 0; i < drawCount; i++) {
        const j = i + Math.floor(rng() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      let cursor = 0;
      const fullBoard = [...board, ...pool.slice(cursor, (cursor += need))];
      const holes = players.map((p) => p ?? pool.slice(cursor, (cursor += 2)));
      resolve(holes, fullBoard);
    }
  }

  return {
    equities: share.map((s) => s / samples),
    wins,
    ties,
    samples,
    exact,
  };
}
