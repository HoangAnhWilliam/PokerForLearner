'use client';

import { useState } from 'react';
import { SPOTS_6MAX_100BB } from '@poker/engine';
import RangeGrid from './RangeGrid';

export default function ChartsView() {
  const [id, setId] = useState(SPOTS_6MAX_100BB[0]!.id);
  const spot = SPOTS_6MAX_100BB.find((s) => s.id === id)!;
  const groups = [
    { label: 'Mở bài (mọi người trước fold)', kind: 'rfi' },
    { label: 'Gặp một người mở bài', kind: 'vs-open' },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Chart preflop</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/60">
          Cash game 6-max, stack 100bb, raise mở bài 2.5bb. Đây là chart đơn giản cho người mới, dựng theo các nguyên tắc
          phổ biến, không phải kết quả solver. Hàng trên đường chéo là tay đồng chất (s), dưới đường chéo là khác chất (o).
        </p>
      </div>

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.kind} className="flex flex-wrap items-center gap-2">
            <span className="w-full text-xs text-white/50 sm:w-56">{g.label}</span>
            {SPOTS_6MAX_100BB.filter((s) => s.kind === g.kind).map((s) => (
              <button
                key={s.id}
                onClick={() => setId(s.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  s.id === id ? 'border-chip bg-chip/15 text-chip' : 'border-white/15 text-white/60 hover:text-white'
                }`}
              >
                {s.kind === 'rfi' ? s.hero : `${s.hero} vs ${s.opener}`}
              </button>
            ))}
          </div>
        ))}
      </div>

      <section className="grid gap-6 rounded-xl border border-white/10 bg-felt-900/70 p-5 lg:grid-cols-[1.3fr_1fr]">
        <RangeGrid spot={spot} size="lg" />
        <div className="space-y-3 text-sm">
          <h2 className="font-display text-xl">{spot.title}</h2>
          <p className="text-white/70">{spot.tip}</p>
          <div className="space-y-1 font-mono text-xs text-white/50">
            <p>
              <span className="text-rose-300">{spot.kind === 'rfi' ? 'Raise' : '3-bet'}:</span> {spot.ranges.raise}
            </p>
            {spot.ranges.call && (
              <p>
                <span className="text-sky-300">Call:</span> {spot.ranges.call}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
