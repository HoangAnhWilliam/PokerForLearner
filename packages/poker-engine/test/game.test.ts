import { describe, expect, it } from 'vitest';
import { cardKey, createDeck, mulberry32, parseCards, type Card } from '../src/cards';
import {
  applyAction,
  computePots,
  legalActions,
  positionOf,
  potTotal,
  startHand,
  type HandState,
  type PlayerAction,
} from '../src/game';

/** Builds a deck where player i gets holes[i] and the board is `board`. */
function deckFrom(holes: string[], board = ''): Card[] {
  const fixed = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const used = new Set(fixed.map(cardKey));
  return [...fixed, ...createDeck().filter((c) => !used.has(cardKey(c)))];
}

const seats = (...stacks: number[]) => stacks.map((stack, i) => ({ id: `p${i}`, name: `P${i}`, stack }));
const stackOf = (s: HandState, id: string) => s.players.find((p) => p.id === id)!.stack;
const totalChips = (s: HandState) => s.players.reduce((a, p) => a + p.stack + p.committed * (s.complete ? 0 : 1), 0);

function play(s: HandState, ...actions: PlayerAction[]): HandState {
  for (const a of actions) s = applyAction(s, a);
  return s;
}
const fold: PlayerAction = { type: 'fold' };
const call: PlayerAction = { type: 'call' };
const check: PlayerAction = { type: 'check' };
const raise = (to: number): PlayerAction => ({ type: 'raise', amount: to });

describe('starting a hand', () => {
  it('posts blinds and UTG acts first (6-max)', () => {
    const s = startHand({ seats: seats(200, 200, 200, 200, 200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(1) });
    expect(s.players[1]!.bet).toBe(1);
    expect(s.players[2]!.bet).toBe(2);
    expect(s.toAct).toBe(3);
    expect(potTotal(s)).toBe(3);
    expect(positionOf(s, 3)).toBe('UTG');
    expect(positionOf(s, 0)).toBe('BTN');
    expect(positionOf(s, 5)).toBe('CO');
  });

  it('heads-up: the button posts the small blind and acts first preflop, last postflop', () => {
    let s = startHand({ seats: seats(100, 100), button: 0, sb: 1, bb: 2, rng: mulberry32(2) });
    expect(s.players[0]!.bet).toBe(1);
    expect(s.toAct).toBe(0);
    s = play(s, call, check);
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(1);
  });

  it('position names for smaller tables', () => {
    const s5 = startHand({ seats: seats(9, 9, 9, 9, 9), button: 0, sb: 1, bb: 2, rng: mulberry32(1) });
    expect([0, 1, 2, 3, 4].map((i) => positionOf(s5, i))).toEqual(['BTN', 'SB', 'BB', 'HJ', 'CO']);
  });
});

describe('betting', () => {
  it('everyone folds to the big blind: BB wins the small blind', () => {
    let s = startHand({ seats: seats(200, 200, 200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(3) });
    s = play(s, fold, fold, fold);
    expect(s.complete).toBe(true);
    expect(s.showdown).toBe(false);
    expect(stackOf(s, 'p2')).toBe(201);
    expect(stackOf(s, 'p1')).toBe(199);
  });

  it('big blind gets the option when everyone limps', () => {
    let s = startHand({ seats: seats(200, 200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(4) });
    s = play(s, call, call); // BTN calls, SB completes
    expect(s.toAct).toBe(2);
    expect(legalActions(s).check).toBe(true);
    s = play(s, check);
    expect(s.street).toBe('flop');
    expect(s.board.length).toBe(3);
    expect(s.toAct).toBe(1); // SB acts first postflop
  });

  it('minimum raise is the size of the last raise', () => {
    let s = startHand({ seats: seats(200, 200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(5) });
    expect(legalActions(s).minRaiseTo).toBe(4);
    s = play(s, raise(6)); // raise of 4
    expect(legalActions(s).minRaiseTo).toBe(10);
    expect(() => applyAction(s, raise(9))).toThrow();
    s = play(s, raise(10));
    expect(legalActions(s).minRaiseTo).toBe(14);
  });

  it('rejects illegal actions', () => {
    const s = startHand({ seats: seats(200, 200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(6) });
    expect(() => applyAction(s, check)).toThrow();
    expect(() => applyAction(s, raise(500))).toThrow();
    expect(() => applyAction(s, { type: 'raise', amount: 5.5 })).toThrow();
  });

  it('a short all-in raise does not reopen betting for players who acted', () => {
    // p3 (UTG) raises to 10, p4 shoves 14 total (short: a full raise would be to 18)
    let s = startHand({ seats: seats(200, 200, 200, 200, 14), button: 0, sb: 1, bb: 2, rng: mulberry32(7) });
    s = play(s, raise(10), raise(14));
    expect(s.players[4]!.allIn).toBe(true);
    // Blinds have not acted yet: they may still raise
    expect(s.toAct).toBe(0);
    s = play(s, fold, fold, fold); // BTN, SB, BB fold
    expect(s.toAct).toBe(3);
    const legal = legalActions(s);
    expect(legal.call).toBe(4);
    expect(legal.minRaiseTo).toBeNull();
  });

  it('a full raise reopens betting', () => {
    let s = startHand({ seats: seats(200, 200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(8) });
    s = play(s, raise(6), call, raise(20));
    expect(s.toAct).toBe(0);
    expect(legalActions(s).minRaiseTo).toBe(34);
  });

  it('returns an uncalled bet', () => {
    let s = startHand({ seats: seats(200, 200), button: 0, sb: 1, bb: 2, rng: mulberry32(9) });
    s = play(s, raise(50), fold);
    expect(stackOf(s, 'p0')).toBe(202);
    expect(s.events.some((e) => e.kind === 'return' && e.amount === 48)).toBe(true);
  });
});

describe('showdown and pots', () => {
  it('awards the pot to the best hand at showdown', () => {
    const deck = deckFrom(['As Ah', 'Ks Kh'], '2c 7d 9h Js 3c');
    let s = startHand({ seats: seats(100, 100), button: 0, sb: 1, bb: 2, deck });
    s = play(s, call, check, check, check, check, check, check, check);
    expect(s.complete).toBe(true);
    expect(s.showdown).toBe(true);
    expect(stackOf(s, 'p0')).toBe(102);
    expect(s.results![0]!.hand!.name).toBe('Pair');
  });

  it('runs out the board when everyone is all-in', () => {
    const deck = deckFrom(['As Ah', 'Ks Kh'], '2c 7d 9h Js 3c');
    let s = startHand({ seats: seats(100, 100), button: 0, sb: 1, bb: 2, deck });
    s = play(s, raise(100), call);
    expect(s.complete).toBe(true);
    expect(s.board.length).toBe(5);
    expect(stackOf(s, 'p0')).toBe(200);
    expect(stackOf(s, 'p1')).toBe(0);
  });

  it('builds side pots: short stack wins the main pot only', () => {
    // p0 BTN 50 chips with AA, p1 SB 100 with KK, p2 BB 100 with QQ
    const deck = deckFrom(['As Ah', 'Ks Kh', 'Qs Qh'], '2c 7d 9h Jc 3c');
    let s = startHand({ seats: seats(50, 100, 100), button: 0, sb: 1, bb: 2, deck });
    s = play(s, raise(50), raise(100), call);
    expect(s.complete).toBe(true);
    expect(s.results!.map((r) => [r.amount, r.winners])).toEqual([
      [150, ['p0']],
      [100, ['p1']],
    ]);
    expect(stackOf(s, 'p0')).toBe(150);
    expect(stackOf(s, 'p1')).toBe(100);
    expect(stackOf(s, 'p2')).toBe(0);
  });

  it('folded chips stay in the pot but folded players cannot win', () => {
    const pots = computePots([
      { id: 'a', committed: 10, folded: true },
      { id: 'b', committed: 30, folded: false },
      { id: 'c', committed: 30, folded: false },
    ] as never);
    expect(pots).toEqual([{ amount: 70, eligible: ['b', 'c'] }]);
  });

  it('splits a pot and gives the odd chip to the first player left of the button', () => {
    // Board plays: both have a straight on the board
    const deck = deckFrom(['2c 3d', 'Ks Kd', '2d 3c'], 'Th Js Qd Kc Ah');
    // BTN limps, SB folds (its 1 chip stays in), BB checks: pot of 5 for two players
    let s = startHand({ seats: seats(100, 100, 100), button: 0, sb: 1, bb: 2, deck });
    s = play(s, call, fold, check);
    s = play(s, check, check, check, check, check, check);
    expect(s.complete).toBe(true);
    // Split 5 chips: BB (first winner left of the button) gets the odd chip
    const wins = s.events.filter((e) => e.kind === 'win');
    expect(wins).toEqual([
      expect.objectContaining({ playerId: 'p2', amount: 3 }),
      expect.objectContaining({ playerId: 'p0', amount: 2 }),
    ]);
  });
});

describe('random play (fuzz)', () => {
  it('chips are conserved and every hand finishes', () => {
    const rng = mulberry32(2024);
    for (let hand = 0; hand < 400; hand++) {
      const n = 2 + Math.floor(rng() * 5);
      const stacks = Array.from({ length: n }, () => 1 + Math.floor(rng() * 300));
      let s = startHand({ seats: seats(...stacks), button: hand % n, sb: 1, bb: 2, rng });
      const total = stacks.reduce((a, b) => a + b, 0);
      for (let steps = 0; !s.complete; steps++) {
        if (steps > 200) throw new Error('hand did not finish');
        expect(totalChips(s)).toBe(total);
        const l = legalActions(s);
        const r = rng();
        let a: PlayerAction;
        if (l.minRaiseTo !== null && r < 0.25) {
          const to = l.minRaiseTo + Math.floor(rng() * (l.maxRaiseTo! - l.minRaiseTo + 1));
          a = { type: 'raise', amount: to };
        } else if (r < 0.4) a = fold;
        else a = l.check ? check : call;
        s = applyAction(s, a);
      }
      const after = s.players.reduce((a, p) => a + p.stack, 0);
      expect(after).toBe(total);
      expect(s.players.every((p) => p.stack >= 0)).toBe(true);
    }
  });
});
