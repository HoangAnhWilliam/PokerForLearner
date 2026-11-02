import { cardsToString, parseCards, type Card } from './cards';
import { evaluate } from './evaluator';
import { positionOf, type HandState, type Street } from './game';
import type { Position } from './preflop';

/*
 * Hand histories in the PokerStars text format: a parser for real exports
 * (No-Limit Hold'em, cash or tournament) and an exporter for hands played
 * against the bots, so both go through the same analysis.
 */

export type HistoryActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface HistorySeat {
  seat: number;
  name: string;
  stack: number;
}

export interface HistoryPost {
  player: string;
  kind: 'sb' | 'bb' | 'ante' | 'sb+bb';
  amount: number;
}

export interface HistoryAction {
  street: Street;
  player: string;
  type: HistoryActionType;
  /** Chips added by this action. */
  amount: number;
  /** Player's street total after the action. */
  to: number;
  allIn: boolean;
}

export interface HandRecord {
  /** Site hand number. */
  id: string;
  date: string | null;
  table: string | null;
  tournament: boolean;
  /** '$', '€', '£' or '' for play chips / tournament chips. */
  currency: string;
  sb: number;
  bb: number;
  buttonSeat: number;
  /** Players dealt into the hand, in seat order. */
  seats: HistorySeat[];
  /** Index into seats of the button (the closest seat when the button seat is empty). */
  buttonIndex: number;
  hero: string | null;
  heroCards: Card[] | null;
  posts: HistoryPost[];
  actions: HistoryAction[];
  board: Card[];
  /** Cards shown at showdown or in the summary. */
  shown: Record<string, Card[]>;
  collected: { player: string; amount: number }[];
  uncalled: { player: string; amount: number }[];
  totalPot: number | null;
  rake: number;
  raw: string;
}

export interface ParseError {
  /** Position of the hand in the pasted text (0-based). */
  index: number;
  handId: string | null;
  message: string;
}

export interface ParseResult {
  hands: HandRecord[];
  errors: ParseError[];
}

const HEADER = /^PokerStars (?:Zoom )?(?:Hand|Game) #(\d+):\s*(.*)$/;
const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];
export const BOARD_SIZE: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

const POST_KINDS: Record<string, HistoryPost['kind']> = {
  'small blind': 'sb',
  'big blind': 'bb',
  'the ante': 'ante',
  'small & big blinds': 'sb+bb',
};

/** Rounds away floating point noise from cent amounts. */
const r = (x: number) => Math.round(x * 1e6) / 1e6;

function amount(text: string): number {
  const v = parseFloat(text.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(v)) throw new Error(`Số tiền không hợp lệ: "${text}"`);
  return v;
}

const bracketCards = (line: string): Card[] =>
  parseCards([...line.matchAll(/\[([^\]]+)\]/g)].map((g) => g[1]).join(' '));

/** Splits a text file into hands and parses each one. Hands that fail are reported, not thrown. */
export function parseHandHistories(text: string): ParseResult {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const chunks = normalized
    .split(/\n(?=PokerStars (?:Zoom )?(?:Hand|Game) #)/)
    .map((c) => c.trim())
    .filter((c) => HEADER.test(c.split('\n')[0]!.trim()));
  const result: ParseResult = { hands: [], errors: [] };
  chunks.forEach((chunk, index) => {
    try {
      result.hands.push(parseHand(chunk));
    } catch (e) {
      result.errors.push({
        index,
        handId: HEADER.exec(chunk.split('\n')[0]!.trim())?.[1] ?? null,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
  return result;
}

/** Parses one PokerStars hand. Throws on unsupported games or broken text. */
export function parseHand(text: string): HandRecord {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const head = HEADER.exec(lines[0] ?? '');
  if (!head) throw new Error('Không phải hand history PokerStars');
  const desc = head[2]!;
  if (!/Hold'em No Limit/i.test(desc)) throw new Error("Chỉ hỗ trợ No-Limit Hold'em");

  const stakes = /\(([^()/]+)\/([^()/]+)\)/.exec(desc);
  if (!stakes) throw new Error('Không đọc được mức blind');
  const rec: HandRecord = {
    id: head[1]!,
    date: /(\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2})/.exec(desc)?.[1] ?? null,
    table: null,
    tournament: /Tournament #/i.test(desc),
    currency: /[$€£]/.exec(stakes[1]!)?.[0] ?? '',
    sb: amount(stakes[1]!),
    bb: amount(stakes[2]!),
    buttonSeat: 0,
    seats: [],
    buttonIndex: 0,
    hero: null,
    heroCards: null,
    posts: [],
    actions: [],
    board: [],
    shown: {},
    collected: [],
    uncalled: [],
    totalPot: null,
    rake: 0,
    raw: text.trim(),
  };

  let section: 'setup' | 'hand' | 'summary' = 'setup';
  let street: Street = 'preflop';
  let streetBet = new Map<string, number>();
  let names: string[] = [];
  /** Name of the player a "NAME: ..." line belongs to (longest match wins). */
  const speaker = (line: string) => names.find((n) => line.startsWith(`${n}: `)) ?? null;

  for (const line of lines.slice(1)) {
    if (line.startsWith('*** ')) {
      if (/^\*\*\* SECOND/.test(line)) continue; // run it twice: keep the first board
      if (line.includes('HOLE CARDS')) section = 'hand';
      else if (line.includes('SUMMARY')) section = 'summary';
      else {
        const st = /FLOP/.test(line) ? 'flop' : /TURN/.test(line) ? 'turn' : /RIVER/.test(line) ? 'river' : null;
        if (st) {
          street = st;
          streetBet = new Map();
          rec.board = bracketCards(line);
          if (rec.board.length !== BOARD_SIZE[st]) throw new Error(`Bài trên bàn ở ${st} không đúng`);
        }
      }
      continue;
    }

    if (section === 'setup') {
      const table = /^Table '(.+)'.*?Seat #(\d+) is the button/.exec(line);
      if (table) {
        rec.table = table[1]!;
        rec.buttonSeat = Number(table[2]);
        continue;
      }
      const seat = /^Seat (\d+): (.+?) \(([^)]*?) in chips[^)]*\)(.*)$/.exec(line);
      if (seat) {
        if (/sitting out/i.test(seat[4]!)) continue;
        rec.seats.push({ seat: Number(seat[1]), name: seat[2]!, stack: amount(seat[3]!) });
        names = rec.seats.map((s) => s.name).sort((a, b) => b.length - a.length);
        continue;
      }
    }

    if (section === 'summary') {
      const total = /^Total pot (\S+)(?:.*?\| Rake (\S+))?/.exec(line);
      if (total) {
        rec.totalPot = amount(total[1]!);
        rec.rake = total[2] ? amount(total[2]) : 0;
        continue;
      }
      const showed = /^Seat \d+: (.+?)(?: \((?:button|small blind|big blind)\))* (?:showed|mucked) \[([^\]]+)\]/.exec(line);
      if (showed && names.includes(showed[1]!)) rec.shown[showed[1]!] = parseCards(showed[2]!);
      continue;
    }

    const dealt = /^Dealt to (.+?) \[([^\]]+)\]$/.exec(line);
    if (dealt) {
      const cards = parseCards(dealt[2]!);
      if (cards.length === 2 && rec.hero === null) {
        rec.hero = dealt[1]!;
        rec.heroCards = cards;
      }
      continue;
    }
    const uncalled = /^Uncalled bet \(([^)]+)\) returned to (.+)$/.exec(line);
    if (uncalled) {
      rec.uncalled.push({ player: uncalled[2]!, amount: amount(uncalled[1]!) });
      continue;
    }
    const collected = /^(.+?) collected (\S+) from/.exec(line);
    if (collected && names.includes(collected[1]!)) {
      rec.collected.push({ player: collected[1]!, amount: amount(collected[2]!) });
      continue;
    }

    const who = speaker(line);
    if (!who) continue;
    const rest = line.slice(who.length + 2);
    const allIn = /and is all-in/.test(rest);
    const prev = streetBet.get(who) ?? 0;
    let m: RegExpExecArray | null;

    if ((m = /^posts (small blind|big blind|the ante|small & big blinds) (\S+)/.exec(rest))) {
      const kind = POST_KINDS[m[1]!]!;
      const a = amount(m[2]!);
      rec.posts.push({ player: who, kind, amount: a });
      // Antes and the dead part of "small & big blinds" do not count toward the bet to call.
      if (kind !== 'ante') streetBet.set(who, r(prev + (kind === 'sb+bb' ? Math.min(a, rec.bb) : a)));
    } else if (/^folds/.test(rest)) {
      rec.actions.push({ street, player: who, type: 'fold', amount: 0, to: prev, allIn: false });
    } else if (/^checks/.test(rest)) {
      rec.actions.push({ street, player: who, type: 'check', amount: 0, to: prev, allIn: false });
    } else if ((m = /^(calls|bets) (\S+)/.exec(rest))) {
      const a = amount(m[2]!);
      const to = r(prev + a);
      streetBet.set(who, to);
      rec.actions.push({ street, player: who, type: m[1] === 'calls' ? 'call' : 'bet', amount: a, to, allIn });
    } else if ((m = /^raises \S+ to (\S+)/.exec(rest))) {
      const to = amount(m[1]!);
      streetBet.set(who, to);
      rec.actions.push({ street, player: who, type: 'raise', amount: r(to - prev), to, allIn });
    } else if ((m = /^shows \[([^\]]+)\]/.exec(rest))) {
      rec.shown[who] = parseCards(m[1]!);
    }
  }

  if (rec.seats.length < 2) throw new Error('Không tìm thấy đủ người chơi');
  if (section !== 'summary' && rec.collected.length === 0) throw new Error('Ván bị cắt ngang (thiếu kết quả)');
  // Button on an empty seat: use the closest occupied seat before it.
  const before = rec.seats.filter((s) => s.seat <= rec.buttonSeat);
  const btn = (before.length ? before[before.length - 1] : rec.seats[rec.seats.length - 1])!;
  rec.buttonIndex = rec.seats.indexOf(btn);
  return rec;
}

/** Chips a player put in (blinds, antes and actions), minus uncalled bets returned. */
export function committedBy(rec: HandRecord, player: string): number {
  let sum = 0;
  for (const p of rec.posts) if (p.player === player) sum += p.amount;
  for (const a of rec.actions) if (a.player === player) sum += a.amount;
  for (const u of rec.uncalled) if (u.player === player) sum -= u.amount;
  return r(sum);
}

export function collectedBy(rec: HandRecord, player: string): number {
  return r(rec.collected.filter((c) => c.player === player).reduce((s, c) => s + c.amount, 0));
}

/** Chips won (positive) or lost (negative) in the hand. */
export function netResult(rec: HandRecord, player: string): number {
  return r(collectedBy(rec, player) - committedBy(rec, player));
}

export function seatPosition(rec: HandRecord, player: string): Position {
  const i = rec.seats.findIndex((s) => s.name === player);
  if (i < 0) throw new Error(`Không có người chơi ${player}`);
  return positionOf({ players: rec.seats, button: rec.buttonIndex }, i);
}

/** Players who never folded. */
export function playersAtEnd(rec: HandRecord): string[] {
  const folded = new Set(rec.actions.filter((a) => a.type === 'fold').map((a) => a.player));
  return rec.seats.map((s) => s.name).filter((n) => !folded.has(n));
}

/** Street of the last betting action (where the money went in). */
export function lastActionStreet(rec: HandRecord): Street {
  return rec.actions.length ? rec.actions[rec.actions.length - 1]!.street : 'preflop';
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

export interface ReplayPlayer {
  name: string;
  position: Position;
  stack: number;
  /** Chips in front of the player on this street. */
  bet: number;
  folded: boolean;
  allIn: boolean;
  /** Known hole cards (hero, or shown at showdown). */
  cards: Card[] | null;
  lastAction: string | null;
  won: number;
}

export type ReplayEvent =
  | { kind: 'start' }
  | { kind: 'action'; action: HistoryAction }
  | { kind: 'street'; street: Street }
  | { kind: 'result' };

export interface ReplayStep {
  street: Street;
  board: Card[];
  /** Chips in the middle from earlier streets (current bets are on the players). */
  pot: number;
  players: ReplayPlayer[];
  /** Player who acted in this step. */
  actor: number | null;
  event: ReplayEvent;
  /** True on the final step, when shown cards are revealed. */
  final: boolean;
}

/** Table snapshots after the blinds, after every action and street, and at the end. */
export function replaySteps(rec: HandRecord): ReplayStep[] {
  const players: ReplayPlayer[] = rec.seats.map((s) => ({
    name: s.name,
    position: seatPosition(rec, s.name),
    stack: s.stack,
    bet: 0,
    folded: false,
    allIn: false,
    cards: s.name === rec.hero ? rec.heroCards : (rec.shown[s.name] ?? null),
    lastAction: null,
    won: 0,
  }));
  const idx = (name: string) => players.findIndex((p) => p.name === name);
  let pot = 0;
  for (const post of rec.posts) {
    const p = players[idx(post.player)]!;
    p.stack = r(p.stack - post.amount);
    // Antes and the dead small blind of "small & big blinds" go straight to the pot.
    const live = post.kind === 'ante' ? 0 : post.kind === 'sb+bb' ? Math.min(post.amount, rec.bb) : post.amount;
    p.bet = r(p.bet + live);
    pot = r(pot + post.amount - live);
    p.lastAction = post.kind === 'ante' ? 'Ante' : post.kind === 'bb' ? 'BB' : 'SB';
  }

  const steps: ReplayStep[] = [];
  let street: Street = 'preflop';
  const snap = (event: ReplayEvent, actor: number | null, final = false) =>
    steps.push({
      street,
      board: rec.board.slice(0, BOARD_SIZE[street]),
      pot,
      players: players.map((p) => ({ ...p })),
      actor,
      event,
      final,
    });
  const collectBets = () => {
    for (const p of players) {
      pot = r(pot + p.bet);
      p.bet = 0;
    }
  };

  snap({ kind: 'start' }, null);
  const lastStreet = STREET_ORDER.filter((s) => rec.board.length >= BOARD_SIZE[s]).pop() ?? 'preflop';
  for (const st of STREET_ORDER) {
    if (BOARD_SIZE[st] > BOARD_SIZE[lastStreet]) break;
    if (st !== 'preflop') {
      collectBets();
      street = st;
      for (const p of players) if (!p.folded) p.lastAction = null;
      snap({ kind: 'street', street: st }, null);
    }
    for (const a of rec.actions.filter((x) => x.street === st)) {
      const i = idx(a.player);
      const p = players[i]!;
      p.stack = r(p.stack - a.amount);
      p.bet = a.to;
      if (a.type === 'fold') p.folded = true;
      if (a.allIn) p.allIn = true;
      p.lastAction = a.allIn ? 'All-in' : a.type[0]!.toUpperCase() + a.type.slice(1);
      snap({ kind: 'action', action: a }, i);
    }
  }

  for (const u of rec.uncalled) {
    const p = players[idx(u.player)]!;
    p.stack = r(p.stack + u.amount);
    p.bet = r(p.bet - u.amount);
  }
  collectBets();
  for (const c of rec.collected) {
    const p = players[idx(c.player)]!;
    p.stack = r(p.stack + c.amount);
    p.won = r(p.won + c.amount);
  }
  pot = 0;
  snap({ kind: 'result' }, null, true);
  return steps;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export interface ExportOptions {
  handId: string | number;
  date?: Date;
  table?: string;
  /** Player whose hole cards are written as "Dealt to". */
  heroId?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) =>
  `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Writes a finished hand from the game engine as a PokerStars hand history (play chips). */
export function toPokerStars(s: HandState, opts: ExportOptions): string {
  if (!s.complete) throw new Error('Hand is not complete');
  const name = (id: string) => s.players.find((p) => p.id === id)!.name;
  const n = s.players.length;
  const wonBy = new Map<string, number>();
  const foldStreet = new Map<string, Street>();
  for (const e of s.events) {
    if (e.kind === 'win') wonBy.set(e.playerId, (wonBy.get(e.playerId) ?? 0) + e.amount);
    if (e.kind === 'action' && e.type === 'fold') foldStreet.set(e.playerId, e.street);
  }

  const out: string[] = [
    `PokerStars Hand #${opts.handId}:  Hold'em No Limit (${s.sb}/${s.bb}) - ${fmtDate(opts.date ?? new Date())}`,
    `Table '${opts.table ?? 'Trainer'}' ${n}-max Seat #${s.button + 1} is the button`,
  ];
  s.players.forEach((p, i) => {
    const start = p.stack + p.committed - (wonBy.get(p.id) ?? 0);
    out.push(`Seat ${i + 1}: ${p.name} (${start} in chips)`);
  });

  let currentBet = 0;
  let dealt = false;
  let shownDown = false;
  const holeCards = () => {
    if (dealt) return;
    dealt = true;
    out.push('*** HOLE CARDS ***');
    const hero = s.players.find((p) => p.id === opts.heroId);
    if (hero) out.push(`Dealt to ${hero.name} [${cardsToString(hero.hole)}]`);
  };

  for (const e of s.events) {
    if (e.kind === 'post') {
      out.push(`${name(e.playerId)}: posts ${e.blind === 'SB' ? 'small' : 'big'} blind ${e.amount}`);
      currentBet = Math.max(currentBet, e.amount);
      continue;
    }
    holeCards();
    if (e.kind === 'action') {
      const who = name(e.playerId);
      const tail = e.allIn ? ' and is all-in' : '';
      if (e.type === 'fold') out.push(`${who}: folds`);
      else if (e.type === 'check') out.push(`${who}: checks`);
      else if (e.type === 'call') out.push(`${who}: calls ${e.amount}${tail}`);
      else if (e.type === 'bet') out.push(`${who}: bets ${e.amount}${tail}`);
      else out.push(`${who}: raises ${e.to - currentBet} to ${e.to}${tail}`);
      if (e.type === 'bet' || e.type === 'raise') currentBet = Math.max(currentBet, e.to);
    } else if (e.kind === 'street') {
      currentBet = 0;
      const b = e.board;
      if (e.street === 'flop') out.push(`*** FLOP *** [${cardsToString(b)}]`);
      else
        out.push(
          `*** ${e.street.toUpperCase()} *** [${cardsToString(b.slice(0, -1))}] [${cardsToString(b.slice(-1))}]`,
        );
    } else if (e.kind === 'return') {
      out.push(`Uncalled bet (${e.amount}) returned to ${name(e.playerId)}`);
    } else if (e.kind === 'win') {
      if (s.showdown && !shownDown) {
        shownDown = true;
        out.push('*** SHOW DOWN ***');
        for (const p of s.players.filter((x) => !x.folded))
          out.push(`${p.name}: shows [${cardsToString(p.hole)}] (${evaluate([...p.hole, ...s.board]).name.toLowerCase()})`);
      }
      const pots = s.results?.length ?? 1;
      const from = pots > 1 ? (e.potIndex === 0 ? 'main pot' : `side pot-${e.potIndex}`) : 'pot';
      out.push(`${name(e.playerId)} collected ${e.amount} from ${from}`);
    }
  }
  holeCards();

  const total = s.players.reduce((a, p) => a + p.committed, 0);
  out.push('*** SUMMARY ***', `Total pot ${total} | Rake 0`);
  if (s.board.length) out.push(`Board [${cardsToString(s.board)}]`);
  const where: Record<Street, string> = { preflop: 'before Flop', flop: 'on the Flop', turn: 'on the Turn', river: 'on the River' };
  s.players.forEach((p, i) => {
    const won = wonBy.get(p.id) ?? 0;
    const head = `Seat ${i + 1}: ${p.name}`;
    if (p.folded) out.push(`${head} folded ${where[foldStreet.get(p.id) ?? 'preflop']}`);
    else if (s.showdown) {
      const hand = evaluate([...p.hole, ...s.board]).name.toLowerCase();
      out.push(`${head} showed [${cardsToString(p.hole)}] and ${won > 0 ? `won (${won})` : 'lost'} with ${hand}`);
    } else out.push(`${head} collected (${won})`);
  });
  return out.join('\n');
}
