import { HandCategory } from '@poker/engine';

export const CATEGORY_VI: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Mậu thầu',
  [HandCategory.Pair]: 'Một đôi',
  [HandCategory.TwoPair]: 'Hai đôi',
  [HandCategory.ThreeOfAKind]: 'Sám',
  [HandCategory.Straight]: 'Sảnh',
  [HandCategory.Flush]: 'Thùng',
  [HandCategory.FullHouse]: 'Cù lũ',
  [HandCategory.FourOfAKind]: 'Tứ quý',
  [HandCategory.StraightFlush]: 'Thùng phá sảnh',
};

export const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const isRed = (code: string) => code[1] === 'h' || code[1] === 'd';
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
