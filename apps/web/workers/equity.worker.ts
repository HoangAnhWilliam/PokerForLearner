import { equity, parseCards } from '@poker/engine';

export interface EquityRequest {
  id: number;
  hero: string;
  villain: string | null;
  board: string;
}

self.onmessage = (e: MessageEvent<EquityRequest>) => {
  const { id, hero, villain, board } = e.data;
  try {
    const result = equity({
      players: [parseCards(hero), villain ? parseCards(villain) : null],
      board: parseCards(board),
      iterations: 30000,
    });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
