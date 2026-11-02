import type { Rng } from './cards';
import { equity } from './equity';
import {
  legalActions,
  positionOf,
  potTotal,
  type HandState,
  type LegalActions,
  type PlayerAction,
} from './game';
import { SPOTS_6MAX_100BB, actionGrid, type Position } from './preflop';
import { handClassOf, type HandClass } from './ranges';

export type BotStyle = 'tag' | 'lag' | 'station' | 'nit';

export interface BotProfile {
  style: BotStyle;
  label: string;
  description: string;
  /** Opening range: -1 = one position tighter than the chart, +1 = one position wider. */
  rfiShift: -1 | 0 | 1;
  /** Minimum Chen score to 3-bet; +2 for each extra raise. */
  threeBetChen: number;
  /** Minimum Chen score to call a raise. */
  callChen: number;
  /** Minimum Chen score to limp when not opening, or null to never limp. */
  limpChen: number | null;
  /** Chance to 3-bet a suited hand as a bluff. */
  bluff3bet: number;
  /** Postflop: equity needed to bet for value when checked to. */
  valueEq: number;
  /** Postflop: equity needed to raise a bet. */
  raiseEq: number;
  /** Postflop: extra equity above pot odds required to call (negative = calls too much). */
  callMargin: number;
  /** Postflop: chance to bet as a bluff when checked to. */
  bluff: number;
  /** Bet size as a fraction of the pot. */
  betSize: number;
}

export const BOT_PROFILES: Record<BotStyle, BotProfile> = {
  tag: {
    style: 'tag',
    label: 'TAG',
    description: 'Chặt và hung hăng: chơi ít tay nhưng khi chơi thì raise. Kiểu chơi chuẩn nên học theo.',
    rfiShift: 0,
    threeBetChen: 10,
    callChen: 7,
    limpChen: null,
    bluff3bet: 0.05,
    valueEq: 0.6,
    raiseEq: 0.8,
    callMargin: 0.02,
    bluff: 0.12,
    betSize: 0.6,
  },
  lag: {
    style: 'lag',
    label: 'LAG',
    description: 'Lỏng và hung hăng: chơi nhiều tay, bet và bluff thường xuyên. Khó chịu để đối đầu.',
    rfiShift: 1,
    threeBetChen: 9,
    callChen: 6,
    limpChen: null,
    bluff3bet: 0.15,
    valueEq: 0.52,
    raiseEq: 0.72,
    callMargin: 0,
    bluff: 0.3,
    betSize: 0.75,
  },
  station: {
    style: 'station',
    label: 'Station',
    description: 'Calling station: thích call, hiếm khi raise và gần như không bao giờ bỏ bài. Đừng bluff, hãy bet giá trị.',
    rfiShift: 0,
    threeBetChen: 12,
    callChen: 4,
    limpChen: 5,
    bluff3bet: 0,
    valueEq: 0.72,
    raiseEq: 0.9,
    callMargin: -0.1,
    bluff: 0.03,
    betSize: 0.5,
  },
  nit: {
    style: 'nit',
    label: 'Nit',
    description: 'Cực kỳ chặt: chỉ chơi tay rất mạnh. Khi nit raise, thường là bài thật.',
    rfiShift: -1,
    threeBetChen: 12,
    callChen: 9,
    limpChen: null,
    bluff3bet: 0,
    valueEq: 0.68,
    raiseEq: 0.86,
    callMargin: 0.06,
    bluff: 0.02,
    betSize: 0.6,
  },
};

/**
 * Chen formula: a quick 0-20 score of a starting hand's strength
 * (AA = 20, 72o = -1). Used as a simple rule of thumb for bots.
 */
export function chenScore(hc: HandClass): number {
  const value = (r: string) => {
    const i = '23456789TJQKA'.indexOf(r) + 2;
    if (i === 14) return 10;
    if (i === 13) return 8;
    if (i === 12) return 7;
    if (i === 11) return 6;
    return i / 2;
  };
  const rank = (r: string) => '23456789TJQKA'.indexOf(r) + 2;
  const [a, b] = [hc[0]!, hc[1]!];
  let score = value(a);
  if (a === b) return Math.max(5, Math.ceil(score * 2));
  if (hc[2] === 's') score += 2;
  const gap = rank(a) - rank(b) - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && rank(a) < 12) score += 1;
  return Math.ceil(score);
}

const OPEN_ORDER: Position[] = ['UTG', 'HJ', 'CO', 'BTN'];

/** The opening chart a bot uses from a position, shifted by its style. */
function openChart(pos: Position, shift: number) {
  let base: Position = pos === 'SB' ? 'SB' : pos === 'BB' ? 'BTN' : pos;
  if (base === 'SB') {
    if (shift > 0) base = 'BTN';
    else if (shift < 0) base = 'CO';
  } else {
    const i = Math.min(OPEN_ORDER.length - 1, Math.max(0, OPEN_ORDER.indexOf(base) + shift));
    base = OPEN_ORDER[i]!;
  }
  return SPOTS_6MAX_100BB.find((s) => s.kind === 'rfi' && s.hero === base)!;
}

/** Turns a desired raise size into a legal action. */
function raiseTo(s: HandState, legal: LegalActions, to: number): PlayerAction {
  if (legal.minRaiseTo === null || legal.maxRaiseTo === null) {
    return legal.check ? { type: 'check' } : { type: 'call' };
  }
  let t = Math.round(to);
  t = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, t));
  // If a raise would leave almost nothing behind, just go all-in.
  if (legal.maxRaiseTo - t < s.bb * 3) t = legal.maxRaiseTo;
  return { type: s.currentBet === 0 ? 'bet' : 'raise', amount: t };
}

const passive = (legal: LegalActions): PlayerAction => (legal.check ? { type: 'check' } : { type: 'fold' });

/** Decide an action for the player to act. Always returns a legal action. */
export function decideBotAction(s: HandState, profile: BotProfile, rng: Rng = Math.random): PlayerAction {
  if (s.toAct === null) throw new Error('No player to act');
  const legal = legalActions(s);
  const me = s.players[s.toAct]!;
  const hc = handClassOf(me.hole[0]!, me.hole[1]!);

  if (s.street === 'preflop') {
    const chen = chenScore(hc);
    const pos = positionOf(s, s.toAct);
    const preflopActions = s.events.filter((e) => e.kind === 'action' && e.street === 'preflop');
    const raises = preflopActions.filter((e) => e.kind === 'action' && (e.type === 'raise' || e.type === 'bet')).length;
    const limpers = preflopActions.filter((e) => e.kind === 'action' && e.type === 'call').length;

    if (raises === 0) {
      if (legal.check) {
        // Big blind after limps: raise strong hands, otherwise take the free flop.
        return chen >= 10 ? raiseTo(s, legal, s.bb * (3 + limpers)) : { type: 'check' };
      }
      const chart = openChart(pos, profile.rfiShift);
      if (actionGrid(chart).get(hc) === 'raise') return raiseTo(s, legal, s.bb * 2.5 + limpers * s.bb);
      if (profile.limpChen !== null && chen >= profile.limpChen) return { type: 'call' };
      return { type: 'fold' };
    }

    const need3bet = profile.threeBetChen + (raises - 1) * 2;
    const bluff = raises === 1 && hc.endsWith('s') && chen >= 5 && chen < 8 && rng() < profile.bluff3bet;
    if (chen >= need3bet || bluff) {
      const target = raises === 1 ? s.currentBet * 3 : s.currentBet * 2.5;
      // Big re-raises with a deep commitment become all-ins.
      const action = raiseTo(s, legal, target >= (me.stack + me.bet) * 0.4 ? me.stack + me.bet : target);
      if (action.type !== 'call' || legal.call > 0) return action;
    }
    let needCall = profile.callChen + (raises - 1) * 2;
    if (legal.call > me.stack * 0.15) needCall += 2;
    if (pos === 'BB' && raises === 1) needCall -= 1;
    if (chen >= needCall) return legal.call > 0 ? { type: 'call' } : { type: 'check' };
    return passive(legal);
  }

  // Postflop: equity against random hands for each remaining opponent.
  const opponents = s.players.filter((p) => !p.folded && p !== me).length;
  const eq = equity({
    players: [me.hole, ...Array.from({ length: opponents }, () => null)],
    board: s.board,
    iterations: 300,
    rng,
  }).equities[0]!;
  const pot = potTotal(s);

  if (legal.call === 0) {
    if (eq >= profile.valueEq || (opponents <= 2 && rng() < profile.bluff)) {
      return raiseTo(s, legal, s.currentBet + pot * profile.betSize);
    }
    return { type: 'check' };
  }

  const required = legal.call / (pot + legal.call);
  if (eq >= profile.raiseEq && legal.minRaiseTo !== null) {
    return raiseTo(s, legal, s.currentBet + Math.max(s.minRaise, (pot + legal.call) * 0.75));
  }
  if (eq >= required + profile.callMargin) return { type: 'call' };
  return { type: 'fold' };
}
