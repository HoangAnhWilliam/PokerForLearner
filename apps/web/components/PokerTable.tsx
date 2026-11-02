import { POSITIONS, type Card, type PreflopSpot } from '@poker/engine';
import { cardToString } from '@poker/engine';
import PlayingCard from './PlayingCard';

type SeatState = 'folded' | 'raised' | 'hero' | 'waiting';

/** What each seat has done before the hero acts, in preflop action order UTG → BB. */
function seatStates(spot: PreflopSpot): Record<string, SeatState> {
  const heroIdx = POSITIONS.indexOf(spot.hero);
  const openerIdx = spot.opener ? POSITIONS.indexOf(spot.opener) : -1;
  const states: Record<string, SeatState> = {};
  POSITIONS.forEach((p, i) => {
    if (i === heroIdx) states[p] = 'hero';
    else if (i === openerIdx) states[p] = 'raised';
    else if (i < heroIdx) states[p] = 'folded';
    else states[p] = 'waiting';
  });
  return states;
}

const BLIND: Record<string, string> = { SB: '0.5', BB: '1' };

export default function PokerTable({ spot, cards }: { spot: PreflopSpot; cards: [Card, Card] }) {
  const states = seatStates(spot);
  const heroIdx = POSITIONS.indexOf(spot.hero);
  // Seats ordered clockwise from the hero; the hero sits at the bottom.
  const seats = POSITIONS.map((_, k) => POSITIONS[(heroIdx + k) % POSITIONS.length]!);

  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-xl sm:aspect-[16/10]">
      <div className="absolute inset-[14%_10%] rounded-[50%] border-[6px] border-[#3b2a1a] bg-gradient-to-b from-felt-600 to-felt-700 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs text-white/40">Pot {spot.opener ? '4' : '1.5'} bb</span>
      </div>
      {seats.map((pos, k) => {
        const angle = ((90 + k * 60) * Math.PI) / 180;
        const x = 50 + 42 * Math.cos(angle);
        const y = 50 + 40 * Math.sin(angle);
        const state = states[pos]!;
        const chipX = 50 + 26 * Math.cos(angle);
        const chipY = 50 + 22 * Math.sin(angle);
        const bet = state === 'raised' ? '2.5' : BLIND[pos];
        return (
          <div key={pos}>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {state === 'hero' ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-1">
                    <PlayingCard code={cardToString(cards[0])} size="md" />
                    <PlayingCard code={cardToString(cards[1])} size="md" />
                  </div>
                  <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-bold text-felt-950">{pos === 'BTN' ? 'BTN (D)' : pos} · Bạn</span>
                </div>
              ) : (
                <div
                  className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border text-[11px] font-semibold sm:h-14 sm:w-14 sm:text-xs ${
                    state === 'folded'
                      ? 'border-white/10 bg-black/40 text-white/30'
                      : state === 'raised'
                        ? 'border-rose-400 bg-rose-900/80 text-white'
                        : 'border-white/30 bg-felt-900 text-white/80'
                  }`}
                >
                  <span>{pos}</span>
                  <span className="text-[9px] font-normal opacity-80">
                    {state === 'folded' ? 'fold' : state === 'raised' ? 'raise' : 'chờ'}
                  </span>
                </div>
              )}
              {pos === 'BTN' && state !== 'hero' && (
                <span className="absolute -right-2 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900">
                  D
                </span>
              )}
            </div>
            {bet && (
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-chip/60 bg-black/50 px-1.5 text-[10px] text-chip"
                style={{ left: `${chipX}%`, top: `${chipY}%` }}
              >
                {bet}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
