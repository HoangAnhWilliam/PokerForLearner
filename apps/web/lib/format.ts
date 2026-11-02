import { cardsToString, type HandEvent } from '@poker/engine';
import { CATEGORY_VI } from './labels';
import { HandCategory } from '@poker/engine';

/** Chips → big blinds, e.g. 5 chips with bb=2 → "2.5bb". */
export function fmtBB(chips: number, bb: number): string {
  // Round first: cent amounts like 0.06 / 0.02 are not exact in floating point.
  const v = Math.round((chips / bb) * 100) / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}bb`;
}

const ENGLISH_TO_CATEGORY: Record<string, HandCategory> = {
  'High card': HandCategory.HighCard,
  Pair: HandCategory.Pair,
  'Two pair': HandCategory.TwoPair,
  'Three of a kind': HandCategory.ThreeOfAKind,
  Straight: HandCategory.Straight,
  Flush: HandCategory.Flush,
  'Full house': HandCategory.FullHouse,
  'Four of a kind': HandCategory.FourOfAKind,
  'Straight flush': HandCategory.StraightFlush,
};

export const handNameVi = (name: string) => {
  const cat = ENGLISH_TO_CATEGORY[name];
  return cat === undefined ? name : CATEGORY_VI[cat];
};

const STREET_VI = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' } as const;

export function eventText(e: HandEvent, name: (id: string) => string, bb: number): string {
  switch (e.kind) {
    case 'post':
      return `${name(e.playerId)} đặt ${e.blind} ${fmtBB(e.amount, bb)}`;
    case 'street':
      return `── ${STREET_VI[e.street]}: ${cardsToString(e.board)}`;
    case 'return':
      return `${name(e.playerId)} nhận lại ${fmtBB(e.amount, bb)} không ai theo`;
    case 'win':
      return `${name(e.playerId)} thắng ${fmtBB(e.amount, bb)}${e.hand ? ` với ${handNameVi(e.hand)}` : ''}`;
    case 'action': {
      const who = name(e.playerId);
      const allIn = e.allIn ? ' (all-in)' : '';
      switch (e.type) {
        case 'fold':
          return `${who} fold`;
        case 'check':
          return `${who} check`;
        case 'call':
          return `${who} call ${fmtBB(e.amount, bb)}${allIn}`;
        case 'bet':
          return `${who} bet ${fmtBB(e.to, bb)}${allIn}`;
        case 'raise':
          return `${who} raise lên ${fmtBB(e.to, bb)}${allIn}`;
      }
    }
  }
}

/** Short label of a player's latest action on the current street. */
export function lastActionLabel(events: HandEvent[], playerId: string, street: string, bb: number): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === 'street') return null;
    if (e.kind === 'action' && e.playerId === playerId && e.street === street) {
      if (e.allIn && e.type !== 'fold' && e.type !== 'check') return 'All-in';
      if (e.type === 'raise') return `Raise ${fmtBB(e.to, bb)}`;
      if (e.type === 'bet') return `Bet ${fmtBB(e.to, bb)}`;
      return e.type[0]!.toUpperCase() + e.type.slice(1);
    }
  }
  return null;
}
