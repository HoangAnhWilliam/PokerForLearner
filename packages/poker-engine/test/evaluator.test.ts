import { describe, expect, it } from 'vitest';
import { createDeck, parseCard, parseCards, cardToString, shuffle, mulberry32 } from '../src/cards';
import { evaluate, evaluate5, findWinners, HandCategory } from '../src/evaluator';

const rank = (s: string) => evaluate(parseCards(s));

describe('cards', () => {
  it('parses and prints cards', () => {
    expect(cardToString(parseCard('Td'))).toBe('Td');
    expect(parseCards('As Kd,Qh').length).toBe(3);
    expect(() => parseCard('1x')).toThrow();
  });
  it('creates a 52-card deck with unique cards', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    expect(new Set(deck.map(cardToString)).size).toBe(52);
  });
  it('shuffle keeps all cards and is deterministic with a seed', () => {
    const a = shuffle(createDeck(), mulberry32(1)).map(cardToString);
    const b = shuffle(createDeck(), mulberry32(1)).map(cardToString);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(52);
  });
});

describe('evaluate: categories', () => {
  it.each([
    ['5h 6h 7h 8h 9h', HandCategory.StraightFlush],
    ['Ks Kh Kd Kc 2s', HandCategory.FourOfAKind],
    ['9s 9h 9d 4c 4s', HandCategory.FullHouse],
    ['2d 5d 8d Jd Kd', HandCategory.Flush],
    ['4s 5h 6d 7c 8s', HandCategory.Straight],
    ['Qs Qh Qd 2c 7s', HandCategory.ThreeOfAKind],
    ['Js Jh 5d 5c Ks', HandCategory.TwoPair],
    ['8s 8h Ad 5c 3s', HandCategory.Pair],
    ['As Jh 9d 6c 3s', HandCategory.HighCard],
  ])('%s', (cards, category) => {
    expect(rank(cards).category).toBe(category);
  });

  it('royal flush is the best straight flush', () => {
    expect(rank('As Ks Qs Js Ts').score).toBeGreaterThan(rank('9s Ks Qs Js Ts').score);
  });
});

describe('evaluate: tiebreaks', () => {
  it('wheel (A-2-3-4-5) is the lowest straight', () => {
    const wheel = rank('As 2h 3d 4c 5s');
    expect(wheel.category).toBe(HandCategory.Straight);
    expect(wheel.score).toBeLessThan(rank('2s 3h 4d 5c 6s').score);
  });
  it('does not wrap around (Q-K-A-2-3 is not a straight)', () => {
    expect(rank('Qs Kh Ad 2c 3s').category).toBe(HandCategory.HighCard);
  });
  it('kicker decides between equal pairs', () => {
    expect(rank('As Ah Kd 5c 3s').score).toBeGreaterThan(rank('Ad Ac Qd 5h 3d').score);
  });
  it('higher full house trips win', () => {
    expect(rank('Ks Kh Kd 2c 2s').score).toBeGreaterThan(rank('Qs Qh Qd Ac As').score);
  });
  it('flush compares highest card first', () => {
    expect(rank('As 9s 7s 4s 2s').score).toBeGreaterThan(rank('Kh Qh Jh 9h 8h').score);
  });
  it('two pair compares high pair, low pair, then kicker', () => {
    expect(rank('Ks Kh 3d 3c As').score).toBeGreaterThan(rank('Qs Qh Jd Jc As').score);
    expect(rank('Ks Kh 5d 5c 2s').score).toBeGreaterThan(rank('Kd Kc 4d 4h As').score);
    expect(rank('Ks Kh 5d 5c Ac').score).toBeGreaterThan(rank('Kd Kc 5s 5h Qc').score);
  });
});

describe('evaluate: 7 cards', () => {
  it('picks the best 5 of 7', () => {
    const r = rank('As Ah Ad 2c 2d 9s 4h');
    expect(r.category).toBe(HandCategory.FullHouse);
  });
  it('finds a flush hidden in 7 cards', () => {
    expect(rank('2h 5h 9h Jh Kh As Ad').category).toBe(HandCategory.Flush);
  });
  it('evaluate5 rejects wrong size', () => {
    expect(() => evaluate5(parseCards('As Kd'))).toThrow();
  });
});

describe('findWinners', () => {
  it('returns the single winner', () => {
    const board = parseCards('2c 7d 9h Js Kc');
    expect(findWinners([parseCards('As Ad'), parseCards('Qs Qd')], board)).toEqual([0]);
  });
  it('splits when the board plays', () => {
    const board = parseCards('As Ks Qs Js Ts');
    expect(findWinners([parseCards('2c 3d'), parseCards('4h 5h')], board)).toEqual([0, 1]);
  });
  it('splits on equal kickers', () => {
    const board = parseCards('Ac Kd 9h 5s 2c');
    expect(findWinners([parseCards('Ad 7s'), parseCards('Ah 7d')], board)).toEqual([0, 1]);
  });
});
