import { describe, expect, it } from 'vitest';
import { cardKey, createDeck, mulberry32, parseCards, type Card } from '../src/cards';
import { applyAction, startHand, type HandState } from '../src/game';
import { BOT_PROFILES, chenScore, decideBotAction, type BotStyle } from '../src/bot';

function deckFrom(holes: string[], board = ''): Card[] {
  const fixed = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const used = new Set(fixed.map(cardKey));
  return [...fixed, ...createDeck().filter((c) => !used.has(cardKey(c)))];
}
const seats = (n: number, stack = 200) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, stack }));

describe('chenScore', () => {
  it.each([
    ['AA', 20],
    ['KK', 16],
    ['22', 5],
    ['AKs', 12],
    ['AKo', 10],
    ['JTs', 9],
    ['72o', -1],
  ])('%s = %i', (hc, score) => {
    expect(chenScore(hc)).toBe(score);
  });
});

describe('preflop decisions', () => {
  // 6 players, button 0 → UTG is seat 3
  const utgWith = (hole: string) =>
    startHand({ seats: seats(6), button: 0, sb: 1, bb: 2, deck: deckFrom(['2c 3d', '4c 5d', '6c 7d', hole, '8c 9d', 'Tc Jd']) });

  it('every style opens AA and folds 72o from UTG', () => {
    for (const p of Object.values(BOT_PROFILES)) {
      expect(decideBotAction(utgWith('As Ah'), p, mulberry32(1)).type).toBe('raise');
      expect(decideBotAction(utgWith('7s 2h'), p, mulberry32(1)).type).toBe('fold');
    }
  });

  it('opens to 2.5bb', () => {
    const a = decideBotAction(utgWith('As Ah'), BOT_PROFILES.tag, mulberry32(1));
    expect(a).toEqual({ type: 'raise', amount: 5 });
  });

  it('a LAG opens wider than a nit', () => {
    // 55 is outside the UTG chart but inside HJ
    expect(decideBotAction(utgWith('5s 5h'), BOT_PROFILES.lag, mulberry32(1)).type).toBe('raise');
    expect(decideBotAction(utgWith('5s 5h'), BOT_PROFILES.nit, mulberry32(1)).type).toBe('fold');
  });
});

describe('full games between bots', () => {
  it('bots always choose legal actions and chips are conserved', () => {
    const rng = mulberry32(99);
    const styles: BotStyle[] = ['tag', 'lag', 'station', 'nit', 'tag', 'lag'];
    let stacks = Array(6).fill(200) as number[];
    const vpip: Record<string, number> = { tag: 0, lag: 0, station: 0, nit: 0 };
    const dealt: Record<string, number> = { tag: 0, lag: 0, station: 0, nit: 0 };

    for (let hand = 0; hand < 150; hand++) {
      stacks = stacks.map((x) => (x < 20 ? 200 : x)); // rebuy
      const total = stacks.reduce((a, b) => a + b, 0);
      let s: HandState = startHand({
        seats: stacks.map((stack, i) => ({ id: `p${i}`, name: styles[i]!, stack })),
        button: hand % 6,
        sb: 1,
        bb: 2,
        rng,
      });
      const voluntary = new Set<string>();
      while (!s.complete) {
        const style = styles[s.toAct!]!;
        const action = decideBotAction(s, BOT_PROFILES[style], rng);
        if (s.street === 'preflop' && (action.type === 'call' || action.type === 'raise'))
          voluntary.add(s.players[s.toAct!]!.id);
        s = applyAction(s, action); // throws if illegal
      }
      s.players.forEach((p, i) => {
        dealt[styles[i]!]!++;
        if (voluntary.has(p.id)) vpip[styles[i]!]!++;
      });
      stacks = s.players.map((p) => p.stack);
      expect(stacks.reduce((a, b) => a + b, 0)).toBe(total);
    }

    const rate = (st: BotStyle) => vpip[st]! / dealt[st]!;
    expect(rate('station')).toBeGreaterThan(rate('tag'));
    expect(rate('lag')).toBeGreaterThan(rate('nit'));
    expect(rate('tag')).toBeGreaterThan(rate('nit'));
  }, 30000);
});
