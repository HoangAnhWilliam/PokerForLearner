import type { Card, Rng } from './cards';
import {
  ALL_HAND_CLASSES,
  comboCount,
  GRID_RANKS,
  gridHandClass,
  handClassCell,
  parseRange,
  randomCombo,
  type HandClass,
} from './ranges';

export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
export type Position = (typeof POSITIONS)[number];

export type PreflopAction = 'fold' | 'call' | 'raise';

export interface PreflopSpot {
  id: string;
  /** 'rfi' = everyone folded to you (raise first in). 'vs-open' = one player opened before you. */
  kind: 'rfi' | 'vs-open';
  hero: Position;
  /** The player who opened (vs-open only). */
  opener?: Position;
  title: string;
  /** Short beginner-oriented explanation of the spot. */
  tip: string;
  /** Actions available as answers. */
  actions: PreflopAction[];
  /** Range notation per action. Raise is checked first, then call; anything else folds. */
  ranges: { raise: string; call?: string };
}

/**
 * Simplified, beginner-friendly charts for 6-max cash games with 100bb stacks.
 * These are hand-built starting points based on widely taught principles
 * (tighter early, wider late, suited and connected hands play better),
 * not solver output.
 */
export const SPOTS_6MAX_100BB: readonly PreflopSpot[] = [
  {
    id: 'rfi-utg',
    kind: 'rfi',
    hero: 'UTG',
    title: 'Mở bài từ UTG',
    tip: 'UTG nói đầu tiên và còn 5 người phía sau, nên chỉ mở với tay mạnh.',
    actions: ['fold', 'raise'],
    ranges: { raise: '66+, A9s+, A5s-A4s, KTs+, QTs+, JTs, T9s, AJo+, KQo' },
  },
  {
    id: 'rfi-hj',
    kind: 'rfi',
    hero: 'HJ',
    title: 'Mở bài từ HJ',
    tip: 'Còn 4 người phía sau: rộng hơn UTG một chút.',
    actions: ['fold', 'raise'],
    ranges: { raise: '55+, A7s+, A5s-A3s, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo' },
  },
  {
    id: 'rfi-co',
    kind: 'rfi',
    hero: 'CO',
    title: 'Mở bài từ CO',
    tip: 'Chỉ còn BTN và 2 blind phía sau, có thể mở khá rộng.',
    actions: ['fold', 'raise'],
    ranges: {
      raise: '33+, A2s+, K7s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo',
    },
  },
  {
    id: 'rfi-btn',
    kind: 'rfi',
    hero: 'BTN',
    title: 'Mở bài từ BTN',
    tip: 'Vị trí tốt nhất bàn: bạn được nói sau cùng ở mọi vòng sau flop, nên mở rất rộng.',
    actions: ['fold', 'raise'],
    ranges: {
      raise:
        '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
    },
  },
  {
    id: 'rfi-sb',
    kind: 'rfi',
    hero: 'SB',
    title: 'Mở bài từ SB',
    tip: 'Chỉ còn BB phía sau, nhưng bạn sẽ phải nói trước sau flop. Chiến lược đơn giản: raise hoặc fold, không limp.',
    actions: ['fold', 'raise'],
    ranges: {
      raise: '22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A5o+, K9o+, Q9o+, J9o+, T9o',
    },
  },
  {
    id: 'btn-vs-co',
    kind: 'vs-open',
    hero: 'BTN',
    opener: 'CO',
    title: 'BTN gặp CO mở bài',
    tip: 'Bạn có vị trí sau CO. 3-bet tay mạnh (và vài tay A5s-A4s làm bluff), call các tay chơi tốt sau flop, còn lại fold.',
    actions: ['fold', 'call', 'raise'],
    ranges: {
      raise: 'TT+, AJs+, KQs, AQo+, A5s-A4s',
      call: '22-99, ATs-A8s, KTs-KJs, QTs+, J9s+, T9s, 98s, 87s, 76s, AJo, KQo',
    },
  },
  {
    id: 'bb-vs-btn',
    kind: 'vs-open',
    hero: 'BB',
    opener: 'BTN',
    title: 'BB gặp BTN mở bài',
    tip: 'BTN mở rất rộng và bạn đã bỏ 1bb vào pot, nên được giá tốt để call nhiều tay. Nhưng bạn sẽ nói trước sau flop, nên vẫn cần chọn lọc.',
    actions: ['fold', 'call', 'raise'],
    ranges: {
      raise: 'TT+, ATs+, KJs+, QJs, AJo+, KQo, A5s-A2s',
      call:
        '22-99, A6s-A9s, K2s-KTs, Q6s-QTs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, A2o-ATo, K8o-KJo, Q9o+, J9o+, T8o+, 98o, 87o',
    },
  },
  {
    id: 'bb-vs-utg',
    kind: 'vs-open',
    hero: 'BB',
    opener: 'UTG',
    title: 'BB gặp UTG mở bài',
    tip: 'UTG mở range mạnh, nên bạn 3-bet rất ít và chỉ call các tay có khả năng tạo bài mạnh (đôi nhỏ, tay đồng chất).',
    actions: ['fold', 'call', 'raise'],
    ranges: {
      raise: 'QQ+, AKs, AKo, A5s',
      call: '22-JJ, A2s-A4s, A6s-AQs, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, AJo-AQo, KQo',
    },
  },
];

export const ACTION_LABELS: Record<PreflopSpot['kind'], Record<PreflopAction, string>> = {
  rfi: { fold: 'Fold', call: 'Call', raise: 'Raise' },
  'vs-open': { fold: 'Fold', call: 'Call', raise: '3-bet' },
};

const gridCache = new Map<string, Map<HandClass, PreflopAction>>();

/** The correct action for every one of the 169 hand classes in a spot. */
export function actionGrid(spot: PreflopSpot): Map<HandClass, PreflopAction> {
  const cached = gridCache.get(spot.id);
  if (cached) return cached;
  const raise = parseRange(spot.ranges.raise);
  const call = spot.ranges.call ? parseRange(spot.ranges.call) : new Set<HandClass>();
  const grid = new Map<HandClass, PreflopAction>();
  for (const hc of ALL_HAND_CLASSES) {
    grid.set(hc, raise.has(hc) ? 'raise' : call.has(hc) ? 'call' : 'fold');
  }
  gridCache.set(spot.id, grid);
  return grid;
}

export function correctAction(spot: PreflopSpot, hand: HandClass): PreflopAction {
  return actionGrid(spot).get(hand)!;
}

/** Share of all starting hands (0..1) played with each action. */
export function actionFrequencies(spot: PreflopSpot): Record<PreflopAction, number> {
  const freq = { fold: 0, call: 0, raise: 0 };
  for (const [hc, action] of actionGrid(spot)) freq[action] += comboCount(hc) / 1326;
  return freq;
}

/**
 * Sampling weight for each hand class. Hands on the edge of a range (one of the 8
 * neighbouring grid cells has a different action) are the ones beginners get wrong, so they
 * are drawn more often than obvious folds like 72o.
 */
export function questionWeights(spot: PreflopSpot): Map<HandClass, number> {
  const grid = actionGrid(spot);
  const weights = new Map<HandClass, number>();
  for (const hc of ALL_HAND_CLASSES) {
    const { row, col } = handClassCell(hc);
    const action = grid.get(hc)!;
    let boundary = false;
    for (const [dr, dc] of [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1],
    ] as const) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= GRID_RANKS.length || c >= GRID_RANKS.length) continue;
      if (grid.get(gridHandClass(r, c)) !== action) boundary = true;
    }
    const mult = boundary ? 6 : action !== 'fold' ? 2 : 1;
    weights.set(hc, comboCount(hc) * mult);
  }
  return weights;
}

export interface PreflopQuestion {
  spot: PreflopSpot;
  hand: HandClass;
  cards: [Card, Card];
  answer: PreflopAction;
}

export function makeQuestion(spot: PreflopSpot, hand: HandClass, rng: Rng = Math.random): PreflopQuestion {
  return { spot, hand, cards: randomCombo(hand, rng), answer: correctAction(spot, hand) };
}

/** Draw a random question from the given spots. */
export function sampleQuestion(spots: readonly PreflopSpot[], rng: Rng = Math.random): PreflopQuestion {
  if (spots.length === 0) throw new Error('No spots selected');
  const spot = spots[Math.floor(rng() * spots.length)]!;
  const weights = questionWeights(spot);
  let total = 0;
  for (const w of weights.values()) total += w;
  let x = rng() * total;
  for (const [hc, w] of weights) {
    x -= w;
    if (x < 0) return makeQuestion(spot, hc, rng);
  }
  return makeQuestion(spot, ALL_HAND_CLASSES[ALL_HAND_CLASSES.length - 1]!, rng);
}
