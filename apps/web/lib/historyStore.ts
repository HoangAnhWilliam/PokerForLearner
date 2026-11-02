/** Hand histories saved in the browser, as raw PokerStars text. */

export interface StoredHand {
  /** First line of the hand (site + hand number + date), used to skip duplicates. */
  key: string;
  source: 'play' | 'import';
  text: string;
  addedAt: number;
}

const KEY = 'poker.history.v1';
/** About 1.5KB per hand: stays well under the ~5MB localStorage limit. */
const MAX_HANDS = 2000;

export const handKey = (text: string) => text.trim().split('\n')[0]!.trim();

export function loadHands(): StoredHand[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '[]') as StoredHand[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(hands: StoredHand[]): StoredHand[] {
  let list = hands.slice(-MAX_HANDS);
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return list;
    } catch {
      // Quota exceeded: drop the oldest quarter and retry.
      if (list.length < 20) return list;
      list = list.slice(Math.floor(list.length / 4));
    }
  }
}

/** Adds hands, skipping ones already stored. Returns the new list and how many were added. */
export function addHands(texts: string[], source: StoredHand['source']): { hands: StoredHand[]; added: number } {
  const current = loadHands();
  const seen = new Set(current.map((h) => h.key));
  const now = Date.now();
  let added = 0;
  for (const text of texts) {
    const key = handKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    current.push({ key, source, text: text.trim(), addedAt: now });
    added++;
  }
  return { hands: added ? save(current) : current, added };
}

export function removeHands(keep: (h: StoredHand) => boolean): StoredHand[] {
  return save(loadHands().filter(keep));
}
