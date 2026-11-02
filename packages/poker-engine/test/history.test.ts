import { describe, expect, it } from 'vitest';
import { cardKey, cardsToString, createDeck, mulberry32, parseCards, type Card } from '../src/cards';
import { applyAction, startHand, type HandState, type PlayerAction } from '../src/game';
import { BOT_PROFILES, decideBotAction } from '../src/bot';
import {
  committedBy,
  netResult,
  parseHand,
  parseHandHistories,
  replaySteps,
  seatPosition,
  toPokerStars,
} from '../src/history';
import { analyzeHand, summarize } from '../src/analysis';

const HAND_ALLIN = `PokerStars Hand #250000000001:  Hold'em No Limit ($0.01/$0.02 USD) - 2026/10/01 20:15:00 ET
Table 'Alpha II' 6-max Seat #1 is the button
Seat 1: Alice ($2.00 in chips)
Seat 2: Bob Lee ($2.50 in chips)
Seat 3: hero_vn ($2.00 in chips)
Seat 4: Dan ($1.00 in chips)
Seat 5: Eve ($2.00 in chips) is sitting out
Seat 6: Fay ($3.00 in chips)
Bob Lee: posts small blind $0.01
hero_vn: posts big blind $0.02
*** HOLE CARDS ***
Dealt to hero_vn [Ah Kh]
Dan: raises $0.04 to $0.06
Fay: folds
Alice: calls $0.06
Bob Lee: folds
hero_vn: raises $0.18 to $0.24
Dan: calls $0.18
Alice: folds
*** FLOP *** [Kd 7c 2s]
hero_vn: bets $0.30
Dan: raises $0.46 to $0.76 and is all-in
hero_vn: calls $0.46
*** TURN *** [Kd 7c 2s] [9h]
*** RIVER *** [Kd 7c 2s 9h] [3c]
*** SHOW DOWN ***
Dan: shows [7d 7h] (three of a kind, Sevens)
hero_vn: shows [Ah Kh] (a pair of Kings)
Dan collected $1.97 from pot
*** SUMMARY ***
Total pot $2.07 | Rake $0.10
Board [Kd 7c 2s 9h 3c]
Seat 1: Alice (button) folded before Flop
Seat 2: Bob Lee (small blind) folded before Flop
Seat 3: hero_vn (big blind) showed [Ah Kh] and lost with a pair of Kings
Seat 4: Dan showed [7d 7h] and won ($1.97) with three of a kind, Sevens
Seat 6: Fay folded before Flop`;

const HAND_STEAL = `PokerStars Hand #250000000002:  Hold'em No Limit ($0.01/$0.02 USD) - 2026/10/01 20:16:10 ET
Table 'Alpha II' 6-max Seat #3 is the button
Seat 1: Alice ($2.00 in chips)
Seat 2: Bob Lee ($2.49 in chips)
Seat 3: hero_vn ($1.00 in chips)
Seat 4: Dan ($1.97 in chips)
Seat 6: Fay ($3.00 in chips)
Dan: posts small blind $0.01
Fay: posts big blind $0.02
*** HOLE CARDS ***
Dealt to hero_vn [7c 2d]
Alice: folds
Bob Lee: folds
hero_vn: raises $0.04 to $0.06
Dan: folds
Fay: folds
Uncalled bet ($0.04) returned to hero_vn
hero_vn collected $0.05 from pot
hero_vn: doesn't show hand
*** SUMMARY ***
Total pot $0.05 | Rake $0
Seat 3: hero_vn (button) collected ($0.05)`;

describe('parsing PokerStars hand histories', () => {
  it('reads stakes, seats, button, hero and actions', () => {
    const h = parseHand(HAND_ALLIN);
    expect(h.id).toBe('250000000001');
    expect(h.currency).toBe('$');
    expect([h.sb, h.bb]).toEqual([0.01, 0.02]);
    expect(h.table).toBe('Alpha II');
    expect(h.seats.map((s) => s.name)).toEqual(['Alice', 'Bob Lee', 'hero_vn', 'Dan', 'Fay']); // Eve sits out
    expect(h.hero).toBe('hero_vn');
    expect(cardsToString(h.heroCards!)).toBe('Ah Kh');
    expect(cardsToString(h.board)).toBe('Kd 7c 2s 9h 3c');
    expect(cardsToString(h.shown['Dan']!)).toBe('7d 7h');
    expect(h.actions).toHaveLength(10);
    expect(h.actions[4]).toMatchObject({ player: 'hero_vn', type: 'raise', to: 0.24, amount: 0.22 });
    expect(h.actions[8]).toMatchObject({ player: 'Dan', type: 'raise', to: 0.76, amount: 0.76, allIn: true });
    expect(h.totalPot).toBe(2.07);
    expect(h.rake).toBe(0.1);
  });

  it('computes positions with an empty seat and results with rake and uncalled bets', () => {
    const h = parseHand(HAND_ALLIN);
    expect(seatPosition(h, 'Alice')).toBe('BTN');
    expect(seatPosition(h, 'Bob Lee')).toBe('SB');
    expect(seatPosition(h, 'hero_vn')).toBe('BB');
    expect(committedBy(h, 'hero_vn')).toBe(1);
    expect(netResult(h, 'hero_vn')).toBe(-1);
    expect(netResult(h, 'Dan')).toBeCloseTo(0.97);
    expect(netResult(h, 'Bob Lee')).toBe(-0.01);

    const s = parseHand(HAND_STEAL);
    expect(seatPosition(s, 'hero_vn')).toBe('BTN');
    expect(netResult(s, 'hero_vn')).toBeCloseTo(0.03);
  });

  it('splits a file into hands and reports the broken ones', () => {
    const omaha = HAND_STEAL.replace("Hold'em No Limit", 'Omaha Pot Limit').replace('#250000000002', '#3');
    const r = parseHandHistories(`﻿${HAND_ALLIN}\r\n\r\n\r\n${omaha}\n\n${HAND_STEAL}\n`);
    expect(r.hands.map((h) => h.id)).toEqual(['250000000001', '250000000002']);
    expect(r.errors).toEqual([{ index: 1, handId: '3', message: expect.stringContaining("No-Limit Hold'em") }]);
  });

  it('reads tournament hands with antes', () => {
    const t = `PokerStars Hand #9001: Tournament #123, $1+$0.10 USD Hold'em No Limit - Level III (25/50) - 2026/10/01 21:00:00 ET
Table '123 1' 9-max Seat #2 is the button
Seat 1: A (1500 in chips)
Seat 2: B (1500 in chips)
Seat 3: C (1500 in chips)
A: posts the ante 5
B: posts the ante 5
C: posts the ante 5
C: posts small blind 25
A: posts big blind 50
*** HOLE CARDS ***
Dealt to B [Qs Qd]
B: raises 100 to 150
C: folds
A: folds
Uncalled bet (100) returned to B
B collected 140 from pot
*** SUMMARY ***
Total pot 140 | Rake 0`;
    const h = parseHand(t);
    expect(h.tournament).toBe(true);
    expect([h.sb, h.bb]).toEqual([25, 50]);
    expect(seatPosition(h, 'B')).toBe('BTN');
    expect(netResult(h, 'B')).toBe(85);
    expect(netResult(h, 'A')).toBe(-55);
  });
});

describe('replay', () => {
  it('tracks stacks, bets and the pot step by step', () => {
    const steps = replaySteps(parseHand(HAND_ALLIN));
    expect(steps[0]!.players.find((p) => p.name === 'hero_vn')!.bet).toBe(0.02);
    const flop = steps.find((s) => s.event.kind === 'street' && s.event.street === 'flop')!;
    expect(flop.pot).toBeCloseTo(0.55);
    expect(flop.board).toHaveLength(3);
    const last = steps[steps.length - 1]!;
    expect(last.final).toBe(true);
    expect(last.players.find((p) => p.name === 'Dan')!.stack).toBeCloseTo(1.97);
    expect(last.players.find((p) => p.name === 'hero_vn')!.stack).toBeCloseTo(1);
    expect(last.board).toHaveLength(5);
  });
});

/** Deck where player i gets holes[i] and the board is `board`. */
function deckFrom(holes: string[], board: string): Card[] {
  const fixed = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const used = new Set(fixed.map(cardKey));
  return [...fixed, ...createDeck().filter((c) => !used.has(cardKey(c)))];
}

function play(s: HandState, ...actions: PlayerAction[]): HandState {
  for (const a of actions) s = applyAction(s, a);
  return s;
}

describe('export from the game engine', () => {
  it('round-trips a hand with a side pot through the parser', () => {
    let s = startHand({
      seats: [
        { id: 'you', name: 'Bạn', stack: 200 },
        { id: 'b1', name: 'Minh', stack: 50 },
        { id: 'b2', name: 'Lan Anh', stack: 200 },
      ],
      button: 0,
      sb: 1,
      bb: 2,
      deck: deckFrom(['As Ad', 'Ks Kd', 'Qs Qd'], '2c 7h 9d 3s 4c'),
    });
    s = play(s, { type: 'raise', amount: 6 }, { type: 'raise', amount: 50 }, { type: 'call' }, { type: 'call' });
    s = play(s, { type: 'bet', amount: 20 }, { type: 'call' }, { type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'check' });
    expect(s.complete).toBe(true);

    const text = toPokerStars(s, { handId: 42, heroId: 'you', date: new Date(2026, 10, 2, 9, 5, 7) });
    expect(text).toContain('2026/11/02 09:05:07');
    expect(text).toContain('Dealt to Bạn [As Ad]');
    expect(text).toContain('collected 150 from main pot');

    const h = parseHand(text);
    for (const p of s.players) {
      const start = h.seats.find((x) => x.name === p.name)!.stack;
      expect(start).toBe(p.name === 'Minh' ? 50 : 200);
      expect(netResult(h, p.name)).toBe(p.stack - start);
    }
    expect(seatPosition(h, 'Bạn')).toBe('BTN');
    expect(h.actions.filter((a) => a.street === 'preflop').map((a) => a.type)).toEqual(['raise', 'raise', 'call', 'call']);
  });

  it('round-trips random bot games with conserved results', () => {
    const rng = mulberry32(7);
    for (let game = 0; game < 40; game++) {
      const names = ['Bạn', 'Minh', 'Lan', 'Tuấn', 'Hoa', 'Phong'];
      let s = startHand({
        seats: names.map((name, i) => ({ id: `p${i}`, name, stack: 100 + Math.floor(rng() * 200) })),
        button: game % 6,
        sb: 1,
        bb: 2,
        rng,
      });
      while (!s.complete) s = applyAction(s, decideBotAction(s, BOT_PROFILES.lag, rng));
      const h = parseHand(toPokerStars(s, { handId: game, heroId: 'p0' }));
      for (const p of s.players) {
        const start = h.seats.find((x) => x.name === p.name)!.stack;
        expect(netResult(h, p.name)).toBe(p.stack - start);
      }
      expect(replaySteps(h).at(-1)!.players.map((p) => p.stack)).toEqual(s.players.map((p) => p.stack));
    }
  });
});

describe('analysis', () => {
  it('reviews a 3-bet all-in hand', () => {
    const a = analyzeHand(parseHand(HAND_ALLIN), undefined, { rng: mulberry32(1) })!;
    expect(a.position).toBe('BB');
    expect(a.handClass).toBe('AKs');
    expect(a.vpip && a.pfr && a.threeBetOpportunity && a.threeBet).toBe(true);
    expect(a.preflop).toBeNull(); // open + caller: not a chart spot
    expect(a.showdown).toBe(true);
    expect(a.wonAtShowdown).toBe(false);
    expect(a.aggressive).toBe(1);
    expect(a.passive).toBe(1);
    expect(a.allIn!.street).toBe('flop');
    expect(a.allIn!.equity).toBeCloseTo(16 / 990); // exact: 990 turn/river runouts
    expect(a.allIn!.expectedNet).toBeCloseTo(-1, 1);
  });

  it('flags an open that the chart folds', () => {
    const a = analyzeHand(parseHand(HAND_STEAL))!;
    expect(a.preflop).toMatchObject({ hand: '72o', expected: 'fold', actual: 'raise', correct: false });
    expect(a.preflop!.spot.id).toBe('rfi-btn');
    expect(a.netBB).toBeCloseTo(1.5);
  });

  it('summarizes and finds leaks', () => {
    const steal = analyzeHand(parseHand(HAND_STEAL))!;
    const many = Array.from({ length: 40 }, () => steal);
    const s = summarize(many);
    expect(s.hands).toBe(40);
    expect(s.vpip).toBe(1);
    expect(s.bbPer100).toBeCloseTo(150);
    expect(s.byPosition.BTN.hands).toBe(40);
    expect(s.leaks.map((l) => l.id)).toEqual(expect.arrayContaining(['chart', 'vpip-high']));
    expect(s.leaks[0]!.severity).toBe('high');
  });
});
