import type { Card, Rng } from './cards';
import { equity } from './equity';
import type { Street } from './game';
import {
  BOARD_SIZE,
  collectedBy,
  committedBy,
  lastActionStreet,
  netResult,
  playersAtEnd,
  seatPosition,
  type HandRecord,
} from './history';
import { correctAction, POSITIONS, SPOTS_6MAX_100BB, type Position, type PreflopAction, type PreflopSpot } from './preflop';
import { handClassOf, type HandClass } from './ranges';

/*
 * Hand-by-hand review and summary statistics for one player ("hero").
 * Thresholds for leaks are rough guidelines for 6-max cash games at low
 * stakes, meant to point a beginner at what to study, not hard rules.
 */

export interface PreflopCheck {
  spot: PreflopSpot;
  hand: HandClass;
  expected: PreflopAction;
  /** 'call' with no raise before means a limp. */
  actual: PreflopAction;
  correct: boolean;
}

export interface AllInCheck {
  /** Street where the last chips went in. */
  street: Street;
  /** Hero's share of the pot when the money went in (ties split). */
  equity: number;
  /** Chips hero would win on average from that point. */
  expectedNet: number;
  actualNet: number;
  opponent: string;
  opponentCards: Card[];
}

export interface HandAnalysis {
  record: HandRecord;
  hero: string;
  position: Position;
  handClass: HandClass | null;
  /** Result in chips and big blinds. */
  net: number;
  netBB: number;
  vpip: boolean;
  pfr: boolean;
  limped: boolean;
  threeBetOpportunity: boolean;
  threeBet: boolean;
  sawFlop: boolean;
  showdown: boolean;
  wonAtShowdown: boolean;
  /** Postflop bets + raises and calls, for the aggression factor. */
  aggressive: number;
  passive: number;
  preflop: PreflopCheck | null;
  allIn: AllInCheck | null;
}

const toChartAction = (t: string): PreflopAction => (t === 'raise' || t === 'bet' ? 'raise' : t === 'call' ? 'call' : 'fold');

export interface AnalyzeOptions {
  rng?: Rng;
  /** Monte Carlo iterations for preflop all-ins (later streets are exact). Default 20000. */
  iterations?: number;
}

/** Analyses the hand from `hero`'s point of view (default: the player dealt the visible cards). */
export function analyzeHand(rec: HandRecord, hero = rec.hero, opts: AnalyzeOptions = {}): HandAnalysis | null {
  if (!hero || !rec.seats.some((s) => s.name === hero)) return null;
  const cards = hero === rec.hero ? rec.heroCards : (rec.shown[hero] ?? null);
  const handClass = cards ? handClassOf(cards[0]!, cards[1]!) : null;
  const position = seatPosition(rec, hero);

  const pre = rec.actions.filter((a) => a.street === 'preflop');
  const mine = pre.filter((a) => a.player === hero);
  const vpip = mine.some((a) => a.type === 'call' || a.type === 'raise' || a.type === 'bet');
  const pfr = mine.some((a) => a.type === 'raise' || a.type === 'bet');

  // 3-bet: the first time hero acts facing exactly one raise.
  let threeBetOpportunity = false;
  let threeBet = false;
  let raisesBefore = 0;
  let firstDecision: { raises: number; calls: number; type: string } | null = null;
  let callsBefore = 0;
  for (const a of pre) {
    if (a.player === hero) {
      firstDecision ??= { raises: raisesBefore, calls: callsBefore, type: a.type };
      if (raisesBefore === 1 && !threeBetOpportunity) {
        threeBetOpportunity = true;
        threeBet = a.type === 'raise';
      }
      if (a.type === 'raise') break;
    }
    if (a.type === 'raise' || a.type === 'bet') raisesBefore++;
    else if (a.type === 'call') callsBefore++;
  }
  const limped = firstDecision !== null && firstDecision.raises === 0 && firstDecision.type === 'call' && position !== 'BB';

  // Preflop chart check: only the spots the charts cover (folded to hero, or one open with no callers).
  let preflop: PreflopCheck | null = null;
  if (handClass && firstDecision) {
    let spot: PreflopSpot | undefined;
    if (firstDecision.raises === 0 && firstDecision.calls === 0) {
      spot = SPOTS_6MAX_100BB.find((s) => s.kind === 'rfi' && s.hero === position);
    } else if (firstDecision.raises === 1 && firstDecision.calls === 0) {
      const opener = pre.find((a) => a.type === 'raise' || a.type === 'bet')!.player;
      const openerPos = seatPosition(rec, opener);
      spot = SPOTS_6MAX_100BB.find((s) => s.kind === 'vs-open' && s.hero === position && s.opener === openerPos);
    }
    if (spot) {
      const expected = correctAction(spot, handClass);
      const actual = toChartAction(firstDecision.type);
      preflop = { spot, hand: handClass, expected, actual, correct: expected === actual };
    }
  }

  const foldedPreflop = mine.some((a) => a.type === 'fold');
  const sawFlop = !foldedPreflop && rec.board.length >= 3;
  const alive = playersAtEnd(rec);
  const showdown = alive.length > 1 && alive.includes(hero);
  const net = netResult(rec, hero);
  const wonAtShowdown = showdown && collectedBy(rec, hero) > 0;

  let aggressive = 0;
  let passive = 0;
  for (const a of rec.actions) {
    if (a.player !== hero || a.street === 'preflop') continue;
    if (a.type === 'bet' || a.type === 'raise') aggressive++;
    else if (a.type === 'call') passive++;
  }

  // All-in luck: heads-up, both hands known, money in before the river.
  let allIn: AllInCheck | null = null;
  const street = lastActionStreet(rec);
  const boardThen = rec.board.slice(0, BOARD_SIZE[street]);
  if (showdown && cards && alive.length === 2 && rec.board.length === 5 && boardThen.length < 5) {
    const opponent = alive.find((n) => n !== hero)!;
    const opponentCards = rec.shown[opponent];
    if (opponentCards && rec.actions.some((a) => a.allIn)) {
      const eq = equity({ players: [cards, opponentCards], board: boardThen, iterations: opts.iterations ?? 20000, rng: opts.rng }).equities[0]!;
      const pot = rec.collected.reduce((s, c) => s + c.amount, 0);
      allIn = {
        street,
        equity: eq,
        expectedNet: eq * pot - committedBy(rec, hero),
        actualNet: net,
        opponent,
        opponentCards,
      };
    }
  }

  return {
    record: rec,
    hero,
    position,
    handClass,
    net,
    netBB: net / rec.bb,
    vpip,
    pfr,
    limped,
    threeBetOpportunity,
    threeBet,
    sawFlop,
    showdown,
    wonAtShowdown,
    aggressive,
    passive,
    preflop,
    allIn,
  };
}

export interface Leak {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  detail: string;
}

export interface PositionStats {
  hands: number;
  netBB: number;
  vpip: number;
}

export interface HeroSummary {
  hero: string;
  hands: number;
  netBB: number;
  bbPer100: number;
  /** Result if every all-in had paid out its expected value. */
  allInAdjustedBB: number;
  allIns: number;
  vpip: number;
  pfr: number;
  limps: number;
  threeBet: { made: number; opportunities: number };
  sawFlop: number;
  /** Went to showdown, as a share of flops seen. */
  wtsd: number;
  /** Won at showdown, as a share of showdowns. */
  wsd: number;
  showdowns: number;
  /** (bets + raises) / calls after the flop. */
  aggressionFactor: number | null;
  postflopCalls: number;
  preflop: { checked: number; correct: number; tooLoose: number; tooTight: number; limps: number };
  byPosition: Record<Position, PositionStats>;
  leaks: Leak[];
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);
const pctText = (x: number) => `${Math.round(x * 100)}%`;

export function summarize(hands: readonly HandAnalysis[]): HeroSummary {
  const hero = hands[0]?.hero ?? '';
  const n = hands.length;
  const count = (f: (h: HandAnalysis) => boolean) => hands.filter(f).length;
  const netBB = hands.reduce((s, h) => s + h.netBB, 0);
  const allInHands = hands.filter((h) => h.allIn);
  const luck = allInHands.reduce((s, h) => s + (h.allIn!.actualNet - h.allIn!.expectedNet) / h.record.bb, 0);
  const sawFlop = count((h) => h.sawFlop);
  const showdowns = count((h) => h.showdown);
  const aggressive = hands.reduce((s, h) => s + h.aggressive, 0);
  const passive = hands.reduce((s, h) => s + h.passive, 0);
  const checked = hands.filter((h) => h.preflop);
  const wrong = checked.filter((h) => !h.preflop!.correct);
  const order = { fold: 0, call: 1, raise: 2 };
  const tooLoose = wrong.filter((h) => order[h.preflop!.actual] > order[h.preflop!.expected]).length;
  const tooTight = wrong.filter((h) => order[h.preflop!.actual] < order[h.preflop!.expected]).length;

  const byPosition = Object.fromEntries(POSITIONS.map((p) => [p, { hands: 0, netBB: 0, vpip: 0 }])) as Record<
    Position,
    PositionStats
  >;
  for (const h of hands) {
    const p = byPosition[h.position];
    p.hands++;
    p.netBB += h.netBB;
    if (h.vpip) p.vpip++;
  }
  for (const p of Object.values(byPosition)) p.vpip = ratio(p.vpip, p.hands);

  const summary: HeroSummary = {
    hero,
    hands: n,
    netBB,
    bbPer100: ratio(netBB, n) * 100,
    allInAdjustedBB: netBB - luck,
    allIns: allInHands.length,
    vpip: ratio(count((h) => h.vpip), n),
    pfr: ratio(count((h) => h.pfr), n),
    limps: count((h) => h.limped),
    threeBet: { made: count((h) => h.threeBet), opportunities: count((h) => h.threeBetOpportunity) },
    sawFlop,
    wtsd: ratio(showdowns, sawFlop),
    wsd: ratio(count((h) => h.wonAtShowdown), showdowns),
    showdowns,
    aggressionFactor: passive === 0 ? null : aggressive / passive,
    postflopCalls: passive,
    preflop: {
      checked: checked.length,
      correct: checked.length - wrong.length,
      tooLoose,
      tooTight,
      limps: count((h) => h.preflop?.actual === 'call' && h.preflop.spot.kind === 'rfi'),
    },
    byPosition,
    leaks: [],
  };
  summary.leaks = findLeaks(summary);
  return summary;
}

/** Turns the statistics into a short list of things to work on, most important first. */
export function findLeaks(s: HeroSummary): Leak[] {
  const leaks: Leak[] = [];
  const add = (l: Leak) => leaks.push(l);

  if (s.preflop.checked >= 10) {
    const acc = ratio(s.preflop.correct, s.preflop.checked);
    if (acc < 0.8) {
      const parts = [
        s.preflop.tooLoose && `${s.preflop.tooLoose} lần chơi rộng hơn chart`,
        s.preflop.tooTight && `${s.preflop.tooTight} lần chặt hơn chart`,
      ].filter(Boolean);
      add({
        id: 'chart',
        severity: acc < 0.65 ? 'high' : 'medium',
        title: `Chỉ ${pctText(acc)} quyết định preflop khớp chart`,
        detail: `${parts.join(', ')}. Ôn lại ở Preflop trainer, lọc những ván sai bên dưới để xem cụ thể.`,
      });
    }
  }
  if (s.limps >= 3) {
    add({
      id: 'limp',
      severity: 'medium',
      title: `Limp ${s.limps} lần`,
      detail: 'Khi mọi người fold tới bạn, chỉ nên raise hoặc fold. Limp cho đối thủ vào pot rẻ và bạn không thể thắng ngay.',
    });
  }

  if (s.hands >= 30) {
    if (s.vpip > 0.32)
      add({
        id: 'vpip-high',
        severity: s.vpip > 0.4 ? 'high' : 'medium',
        title: `Chơi quá nhiều tay (VPIP ${pctText(s.vpip)})`,
        detail: 'Người mới ở 6-max thường nên giữ VPIP khoảng 20–28%. Bỏ bớt tay yếu, nhất là ở vị trí đầu.',
      });
    else if (s.vpip < 0.15)
      add({
        id: 'vpip-low',
        severity: 'info',
        title: `Chơi khá chặt (VPIP ${pctText(s.vpip)})`,
        detail: 'Bạn bỏ lỡ nhiều tay có lời ở CO, BTN. Thử mở rộng range ở vị trí muộn theo chart.',
      });
    if (s.vpip - s.pfr > 0.1)
      add({
        id: 'passive-preflop',
        severity: 'medium',
        title: `Call preflop nhiều hơn raise (VPIP ${pctText(s.vpip)}, PFR ${pctText(s.pfr)})`,
        detail: 'Khoảng cách VPIP và PFR lớn nghĩa là bạn hay limp hoặc call. Tay đáng chơi thường nên vào pot bằng raise.',
      });
  }
  if (s.threeBet.opportunities >= 20) {
    const tb = ratio(s.threeBet.made, s.threeBet.opportunities);
    if (tb < 0.04)
      add({
        id: '3bet-low',
        severity: 'info',
        title: `Ít 3-bet (${pctText(tb)})`,
        detail: 'Gặp một người mở bài, 3-bet tay mạnh (TT+, AQ+) thay vì chỉ call, để lấy giá trị và thu hẹp pot.',
      });
    else if (tb > 0.14)
      add({
        id: '3bet-high',
        severity: 'medium',
        title: `3-bet quá nhiều (${pctText(tb)})`,
        detail: 'Ở mức cược thấp, đối thủ hiếm khi fold. 3-bet chủ yếu bằng tay mạnh.',
      });
  }
  if (s.sawFlop >= 20 && s.wtsd > 0.36)
    add({
      id: 'wtsd-high',
      severity: 'medium',
      title: `Theo tới showdown quá nhiều (${pctText(s.wtsd)} số flop)`,
      detail: 'Bạn hay call tới cuối với tay trung bình. Khi đối thủ bet mạnh ở turn và river, họ thường có bài.',
    });
  if (s.showdowns >= 15 && s.wsd < 0.45)
    add({
      id: 'wsd-low',
      severity: 'high',
      title: `Thua nhiều ở showdown (chỉ thắng ${pctText(s.wsd)})`,
      detail: 'Dấu hiệu call quá lỏng ở river. Xem lại các ván thua lớn: lúc call bạn cần bao nhiêu equity theo pot odds?',
    });
  if (s.postflopCalls >= 20 && s.aggressionFactor !== null && s.aggressionFactor < 1.5)
    add({
      id: 'passive-postflop',
      severity: 'medium',
      title: `Thụ động sau flop (AF ${s.aggressionFactor.toFixed(1)})`,
      detail: 'Bạn call nhiều hơn bet/raise. Khi có tay mạnh hoặc draw tốt, hãy chủ động bet để thắng pot lớn hơn.',
    });

  const positions = Object.entries(s.byPosition).filter(([, p]) => p.hands >= 15);
  if (positions.length >= 3) {
    const [pos, worst] = positions.sort((a, b) => a[1].netBB / a[1].hands - b[1].netBB / b[1].hands)[0]!;
    if (worst.netBB < 0 && pos !== 'SB' && pos !== 'BB')
      add({
        id: 'position',
        severity: 'info',
        title: `Lỗ nhiều nhất ở ${pos}`,
        detail: `${worst.hands} ván, ${worst.netBB.toFixed(1)}bb, VPIP ${pctText(worst.vpip)} ở vị trí này. Xem lại range mở bài của ${pos}.`,
      });
  }
  if (s.allIns >= 5 && Math.abs(s.allInAdjustedBB - s.netBB) > 20)
    add({
      id: 'variance',
      severity: 'info',
      title: s.allInAdjustedBB > s.netBB ? 'Bạn đang xui ở các ván all-in' : 'Bạn đang hên ở các ván all-in',
      detail: `Kết quả thật ${s.netBB.toFixed(1)}bb, theo equity lúc all-in là ${s.allInAdjustedBB.toFixed(1)}bb. Đánh giá bản thân theo quyết định, không theo kết quả.`,
    });

  const rank = { high: 0, medium: 1, info: 2 };
  return leaks.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
