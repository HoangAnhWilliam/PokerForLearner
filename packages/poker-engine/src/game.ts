import { createDeck, shuffle, type Card, type Rng } from './cards';
import { evaluate, type HandRank } from './evaluator';
import type { Position } from './preflop';

/*
 * No-limit Texas Hold'em hand state machine.
 *
 * All amounts are integer chips. The state is treated as immutable: every
 * function returns a new state, so the UI can keep history and tests can
 * replay hands.
 *
 * Simplification: when a short all-in raise does not reopen the betting,
 * players who had already acted may only call or fold, even if several short
 * raises add up to a full raise.
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface PlayerAction {
  type: ActionType;
  /** For bet/raise: the player's TOTAL bet on this street after the action ("raise to"). */
  amount?: number;
}

export interface SeatInput {
  id: string;
  name: string;
  stack: number;
}

export interface PlayerState {
  id: string;
  name: string;
  stack: number;
  hole: Card[];
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in during the whole hand. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last full raise on this street. */
  acted: boolean;
  /** Faced a short all-in raise after acting: may only call or fold. */
  capped: boolean;
}

export type HandEvent =
  | { kind: 'post'; playerId: string; blind: 'SB' | 'BB'; amount: number }
  | {
      kind: 'action';
      street: Street;
      playerId: string;
      type: ActionType;
      /** Chips added by this action. */
      amount: number;
      /** Player's street total after the action. */
      to: number;
      allIn: boolean;
    }
  | { kind: 'street'; street: Street; board: Card[] }
  | { kind: 'return'; playerId: string; amount: number }
  | { kind: 'win'; playerId: string; amount: number; potIndex: number; hand?: string };

export interface PotResult {
  amount: number;
  eligible: string[];
  winners: string[];
  /** Winning hand, when there was a showdown. */
  hand?: HandRank;
}

export interface HandState {
  players: PlayerState[];
  button: number;
  sb: number;
  bb: number;
  /** Undealt cards, next card first. */
  deck: Card[];
  board: Card[];
  street: Street;
  /** Index of the player to act, or null when the hand is complete. */
  toAct: number | null;
  /** Highest street bet that must be matched. */
  currentBet: number;
  /** Size of the last full raise on this street (minimum raise increment). */
  minRaise: number;
  complete: boolean;
  /** True when cards were shown down (more than one player reached the end). */
  showdown: boolean;
  results: PotResult[] | null;
  events: HandEvent[];
}

export interface StartHandOptions {
  seats: SeatInput[];
  /** Index into seats of the dealer button. */
  button: number;
  sb: number;
  bb: number;
  rng?: Rng;
  /**
   * Fixed deck for tests/replays. Player i receives deck[2i] and deck[2i+1];
   * the board comes from the following cards.
   */
  deck?: Card[];
}

export interface LegalActions {
  fold: boolean;
  check: boolean;
  /** Chips needed to call (0 when checking is possible). */
  call: number;
  /** Smallest legal "raise to" (or bet), null if raising is not allowed. */
  minRaiseTo: number | null;
  /** Largest legal "raise to" (all-in), null if raising is not allowed. */
  maxRaiseTo: number | null;
}

const canAct = (p: PlayerState) => !p.folded && !p.allIn;

function clone(s: HandState): HandState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hole: p.hole.slice() })),
    deck: s.deck.slice(),
    board: s.board.slice(),
    events: s.events.slice(),
    results: s.results ? s.results.map((r) => ({ ...r })) : null,
  };
}

function put(p: PlayerState, amount: number): number {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.committed += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

/** Index of the small blind and big blind. Heads-up, the button posts the small blind. */
export function blindSeats(n: number, button: number): { sb: number; bb: number } {
  if (n === 2) return { sb: button, bb: (button + 1) % 2 };
  return { sb: (button + 1) % n, bb: (button + 2) % n };
}

export function startHand(opts: StartHandOptions): HandState {
  const n = opts.seats.length;
  if (n < 2 || n > 10) throw new Error('Need 2 to 10 players');
  if (opts.seats.some((s) => s.stack <= 0)) throw new Error('Every player needs chips');
  if (!Number.isInteger(opts.sb) || !Number.isInteger(opts.bb) || opts.sb <= 0 || opts.bb < opts.sb)
    throw new Error('Blinds must be positive integers with bb >= sb');

  const deck = opts.deck ? opts.deck.slice() : shuffle(createDeck(), opts.rng);
  const players: PlayerState[] = opts.seats.map((seat, i) => ({
    id: seat.id,
    name: seat.name,
    stack: seat.stack,
    hole: [deck[2 * i]!, deck[2 * i + 1]!],
    bet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
    capped: false,
  }));

  const s: HandState = {
    players,
    button: opts.button % n,
    sb: opts.sb,
    bb: opts.bb,
    deck: deck.slice(2 * n),
    board: [],
    street: 'preflop',
    toAct: null,
    currentBet: 0,
    minRaise: opts.bb,
    complete: false,
    showdown: false,
    results: null,
    events: [],
  };

  const blinds = blindSeats(n, s.button);
  const sbAmt = put(players[blinds.sb]!, opts.sb);
  s.events.push({ kind: 'post', playerId: players[blinds.sb]!.id, blind: 'SB', amount: sbAmt });
  const bbAmt = put(players[blinds.bb]!, opts.bb);
  s.events.push({ kind: 'post', playerId: players[blinds.bb]!.id, blind: 'BB', amount: bbAmt });
  s.currentBet = Math.max(...players.map((p) => p.bet));

  s.toAct = blinds.bb; // advance() moves to the first player after the big blind
  return advance(s);
}

/** What the player to act is allowed to do. */
export function legalActions(s: HandState): LegalActions {
  if (s.toAct === null) return { fold: false, check: false, call: 0, minRaiseTo: null, maxRaiseTo: null };
  const p = s.players[s.toAct]!;
  const toCall = Math.max(0, s.currentBet - p.bet);
  const call = Math.min(toCall, p.stack);
  const othersCanAct = s.players.some((o, i) => i !== s.toAct && canAct(o));
  const canRaise = !p.capped && p.stack > toCall && othersCanAct;
  const maxRaiseTo = p.bet + p.stack;
  return {
    fold: true,
    check: toCall === 0,
    call,
    minRaiseTo: canRaise ? Math.min(s.currentBet + s.minRaise, maxRaiseTo) : null,
    maxRaiseTo: canRaise ? maxRaiseTo : null,
  };
}

export function applyAction(state: HandState, action: PlayerAction): HandState {
  if (state.complete || state.toAct === null) throw new Error('Hand is complete');
  const legal = legalActions(state);
  const s = clone(state);
  const p = s.players[s.toAct!]!;
  let added = 0;
  let type = action.type;

  switch (type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (!legal.check) throw new Error('Cannot check facing a bet');
      break;
    case 'call':
      if (legal.call === 0) throw new Error('Nothing to call');
      added = put(p, legal.call);
      break;
    case 'bet':
    case 'raise': {
      const to = action.amount;
      if (legal.minRaiseTo === null || legal.maxRaiseTo === null) throw new Error('Raising is not allowed');
      if (to === undefined || !Number.isInteger(to)) throw new Error('Raise amount must be an integer');
      if (to < legal.minRaiseTo || to > legal.maxRaiseTo)
        throw new Error(`Raise must be between ${legal.minRaiseTo} and ${legal.maxRaiseTo}`);
      type = s.currentBet === 0 ? 'bet' : 'raise';
      const raiseSize = to - s.currentBet;
      added = put(p, to - p.bet);
      if (raiseSize >= s.minRaise) {
        // Full raise: everyone must act again and may re-raise.
        s.minRaise = raiseSize;
        for (const o of s.players) if (o !== p) {
          o.acted = false;
          o.capped = false;
        }
      } else {
        // Short all-in: players who already acted must respond but cannot re-raise.
        for (const o of s.players) if (o !== p && o.acted && canAct(o)) {
          o.acted = false;
          o.capped = true;
        }
      }
      s.currentBet = to;
      break;
    }
    default:
      throw new Error(`Unknown action ${String(type)}`);
  }

  p.acted = true;
  s.events.push({ kind: 'action', street: s.street, playerId: p.id, type, amount: added, to: p.bet, allIn: p.allIn });
  return advance(s);
}

function nextToAct(s: HandState, from: number): number | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const p = s.players[i]!;
    if (canAct(p) && (!p.acted || p.bet < s.currentBet)) return i;
  }
  return null;
}

function roundComplete(s: HandState): boolean {
  const actors = s.players.filter(canAct);
  if (actors.length === 0) return true;
  if (actors.length === 1) {
    const a = actors[0]!;
    const maxOther = Math.max(0, ...s.players.filter((p) => p !== a && !p.folded).map((p) => p.bet));
    if (a.bet >= maxOther && (a.acted || a.bet >= s.currentBet)) return true;
  }
  return actors.every((p) => p.acted && p.bet === s.currentBet);
}

const NEXT_STREET: Record<Street, Street | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null };

function dealStreet(s: HandState, street: Street) {
  const count = street === 'flop' ? 3 : 1;
  s.board.push(...s.deck.splice(0, count));
  s.street = street;
  s.events.push({ kind: 'street', street, board: s.board.slice() });
}

/** Moves the hand forward until a player needs to act or the hand ends. Mutates s. */
function advance(s: HandState): HandState {
  const alive = s.players.filter((p) => !p.folded);
  if (alive.length === 1) return finish(s);

  if (!roundComplete(s)) {
    s.toAct = nextToAct(s, s.toAct!);
    if (s.toAct !== null) return s;
  }
  // Betting round is over.
  for (const p of s.players) {
    p.bet = 0;
    p.acted = false;
    p.capped = false;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;

  const next = NEXT_STREET[s.street];
  if (next === null) return finish(s);

  if (s.players.filter(canAct).length <= 1) {
    // Nobody left to bet against: run out the board.
    let st: Street | null = next;
    while (st) {
      dealStreet(s, st);
      st = NEXT_STREET[st];
    }
    return finish(s);
  }

  dealStreet(s, next);
  s.toAct = nextToAct(s, s.button);
  return s;
}

/** Splits committed chips into a main pot and side pots. */
export function computePots(players: readonly PlayerState[]): { amount: number; eligible: string[] }[] {
  const levels = [...new Set(players.map((p) => p.committed).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.committed, level) - prev);
    const eligible = players.filter((p) => !p.folded && p.committed >= level).map((p) => p.id);
    const last = pots[pots.length - 1];
    if (last && (eligible.length === 0 || sameSet(last.eligible, eligible))) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Total chips in the middle (all streets). */
export function potTotal(s: HandState): number {
  return s.players.reduce((sum, p) => sum + p.committed, 0);
}

function finish(s: HandState): HandState {
  s.toAct = null;
  s.complete = true;

  // Return the part of the largest bet that nobody matched.
  const sorted = s.players.map((p) => p.committed).sort((a, b) => b - a);
  const [top, second] = [sorted[0]!, sorted[1] ?? 0];
  if (top > second) {
    const p = s.players.find((x) => x.committed === top)!;
    const refund = top - second;
    p.committed -= refund;
    p.stack += refund;
    if (p.stack > 0) p.allIn = false;
    s.events.push({ kind: 'return', playerId: p.id, amount: refund });
  }

  const alive = s.players.filter((p) => !p.folded);
  s.showdown = alive.length > 1;
  const ranks = new Map<string, HandRank>();
  if (s.showdown) for (const p of alive) ranks.set(p.id, evaluate([...p.hole, ...s.board]));

  // Seat order starting left of the button, used to hand out odd chips.
  const n = s.players.length;
  const order = Array.from({ length: n }, (_, k) => s.players[(s.button + 1 + k) % n]!.id);

  s.results = computePots(s.players).map((pot, potIndex) => {
    let winners: string[];
    let hand: HandRank | undefined;
    if (!s.showdown) {
      winners = [alive[0]!.id];
    } else {
      const best = Math.max(...pot.eligible.map((id) => ranks.get(id)!.score));
      winners = order.filter((id) => pot.eligible.includes(id) && ranks.get(id)!.score === best);
      hand = ranks.get(winners[0]!);
    }
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const id of winners) {
      const amount = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      s.players.find((p) => p.id === id)!.stack += amount;
      s.events.push({ kind: 'win', playerId: id, amount, potIndex, hand: hand?.name });
    }
    return { ...pot, winners, hand };
  });
  return s;
}

/** Position names by distance from the button, for 2 to 6 players. */
export function positionOf(s: { players: readonly unknown[]; button: number }, index: number): Position {
  const n = s.players.length;
  const offset = (index - s.button + n) % n;
  if (n === 2) return offset === 0 ? 'BTN' : 'BB';
  const names: Position[] = ['BTN', 'SB', 'BB', ...(['UTG', 'HJ', 'CO'] as Position[]).slice(Math.max(0, 6 - n))];
  if (n > 6) {
    // Extra early seats are all treated as UTG.
    const late: Position[] = ['HJ', 'CO'];
    if (offset <= 2) return names[offset]!;
    if (offset >= n - 2) return late[offset - (n - 2)]!;
    return 'UTG';
  }
  return names[offset]!;
}
