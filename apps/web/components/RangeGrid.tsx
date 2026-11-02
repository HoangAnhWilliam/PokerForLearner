'use client';

import { useState } from 'react';
import {
  actionFrequencies,
  actionGrid,
  ACTION_LABELS,
  GRID_RANKS,
  gridHandClass,
  type HandClass,
  type PreflopAction,
  type PreflopSpot,
} from '@poker/engine';
import { pct } from '@/lib/labels';

export const ACTION_STYLE: Record<PreflopAction, { cell: string; dot: string }> = {
  raise: { cell: 'bg-rose-600 text-white', dot: 'bg-rose-600' },
  call: { cell: 'bg-sky-600 text-white', dot: 'bg-sky-600' },
  fold: { cell: 'bg-white/[0.06] text-white/40', dot: 'bg-white/20' },
};

interface Props {
  spot: PreflopSpot;
  highlight?: HandClass;
  size?: 'sm' | 'lg';
}

export default function RangeGrid({ spot, highlight, size = 'sm' }: Props) {
  const grid = actionGrid(spot);
  const freq = actionFrequencies(spot);
  const [hover, setHover] = useState<HandClass | null>(null);
  const labels = ACTION_LABELS[spot.kind];
  const shown = hover ?? highlight;

  return (
    <div className="space-y-2">
      <div
        className="grid gap-px overflow-hidden rounded-md bg-black/40 p-px"
        style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
        onMouseLeave={() => setHover(null)}
      >
        {GRID_RANKS.split('').flatMap((_, row) =>
          GRID_RANKS.split('').map((__, col) => {
            const hc = gridHandClass(row, col);
            const action = grid.get(hc)!;
            const isHi = hc === highlight;
            return (
              <div
                key={hc}
                onMouseEnter={() => setHover(hc)}
                onClick={() => setHover(hc)}
                className={`flex aspect-square items-center justify-center font-mono leading-none ${
                  size === 'lg' ? 'text-[9px] sm:text-xs' : 'text-[7px] sm:text-[9px]'
                } ${ACTION_STYLE[action].cell} ${isHi ? 'relative z-10 outline-2 outline-offset-0 outline-chip ring-2 ring-chip' : ''}`}
              >
                {hc}
              </div>
            );
          }),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
        {[...spot.actions.filter((a) => a !== 'fold'), 'fold' as const].map((a) => (
            <span key={a} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${ACTION_STYLE[a].dot}`} />
              {labels[a]} {pct(freq[a])}
            </span>
          ))}
        {shown && (
          <span className="ml-auto font-mono text-white">
            {shown}: {labels[grid.get(shown)!]}
          </span>
        )}
      </div>
    </div>
  );
}
