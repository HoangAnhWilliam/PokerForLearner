'use client';

import { useEffect, useMemo, useState } from 'react';
import { ACTION_LABELS, cardsToString, cardToString, replaySteps, type HandAnalysis, type ReplayStep } from '@poker/engine';
import TableView from './TableView';
import { fmtBB } from '@/lib/format';
import { pct } from '@/lib/labels';

const STREET_VI = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' } as const;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

function stepText(step: ReplayStep, bb: number): string {
  const e = step.event;
  switch (e.kind) {
    case 'start':
      return 'Đặt blind, chia bài';
    case 'street':
      return `${STREET_VI[e.street]}: ${cardsToString(step.board)}`;
    case 'result': {
      const winners = step.players.filter((p) => p.won > 0);
      return winners.map((p) => `${p.name} thắng ${fmtBB(p.won, bb)}`).join(', ') || 'Kết thúc';
    }
    case 'action': {
      const a = e.action;
      const allIn = a.allIn ? ' (all-in)' : '';
      if (a.type === 'fold') return `${a.player} fold`;
      if (a.type === 'check') return `${a.player} check`;
      if (a.type === 'call') return `${a.player} call ${fmtBB(a.amount, bb)}${allIn}`;
      if (a.type === 'bet') return `${a.player} bet ${fmtBB(a.to, bb)}${allIn}`;
      return `${a.player} raise lên ${fmtBB(a.to, bb)}${allIn}`;
    }
  }
}

export default function HandReview({ analysis }: { analysis: HandAnalysis }) {
  const rec = analysis.record;
  const bb = rec.bb;
  const steps = useMemo(() => replaySteps(rec), [rec]);
  const [i, setI] = useState(steps.length - 1);

  useEffect(() => setI(steps.length - 1), [steps]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length]);

  const step = steps[Math.min(i, steps.length - 1)]!;
  const heroIndex = Math.max(0, step.players.findIndex((p) => p.name === analysis.hero));
  const potShown = step.final ? step.players.reduce((s, p) => s + p.won, 0) : step.pot;
  const pf = analysis.preflop;
  const ai = analysis.allIn;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Ván #{rec.id}
          <span className="ml-2 text-xs font-normal text-white/50">
            {rec.date ?? ''} · {rec.currency}
            {rec.sb}/{rec.currency}
            {rec.bb}
          </span>
        </h2>
        <span className={`font-mono ${analysis.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signed(analysis.netBB)}bb</span>
      </div>

      <TableView
        bottomIndex={heroIndex}
        board={step.board.map(cardToString)}
        pot={fmtBB(potShown, bb)}
        seats={step.players.map((p, k) => {
          const isHero = p.name === analysis.hero;
          const visible = p.cards && (isHero || step.final);
          return {
            key: p.name,
            name: p.name,
            position: p.position,
            stack: fmtBB(p.stack, bb),
            cards: p.folded && !isHero ? null : visible ? p.cards!.map(cardToString) : ['back', 'back'],
            big: isHero,
            folded: p.folded,
            active: step.actor === k,
            won: step.final && p.won > 0,
            isButton: k === rec.buttonIndex,
            label: step.final && p.won > 0 ? `+${fmtBB(p.won, bb)}` : p.folded ? 'Fold' : p.lastAction,
            bet: p.bet > 0 ? fmtBB(p.bet, bb) : null,
          };
        })}
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => setI(0)}
          className="rounded border border-white/15 px-2 py-1 text-sm text-white/70 hover:text-white"
        >
          Đầu
        </button>
        <button
          onClick={() => setI((x) => Math.max(0, x - 1))}
          className="rounded border border-white/15 px-3 py-1 text-sm hover:bg-white/5"
        >
          ← Trước
        </button>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-chip)]"
          aria-label="Bước trong ván"
        />
        <button
          onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))}
          className="rounded border border-white/15 px-3 py-1 text-sm hover:bg-white/5"
        >
          Sau →
        </button>
      </div>
      <p className="text-center text-sm text-white/80">
        {stepText(step, bb)} <span className="text-xs text-white/40">({i + 1}/{steps.length}, phím ← →)</span>
      </p>

      <section className="space-y-2 rounded-xl border border-chip/30 bg-felt-900/80 p-4 text-sm">
        <h3 className="font-semibold text-chip">Nhận xét</h3>
        <p className="text-white/70">
          Vị trí <b className="text-white">{analysis.position}</b>
          {analysis.handClass && (
            <>
              {' '}
              · tay <b className="text-white">{analysis.handClass}</b>
            </>
          )}
          {analysis.showdown && <> · tới showdown, {analysis.wonAtShowdown ? 'thắng' : 'thua'}</>}
        </p>
        {pf ? (
          pf.correct ? (
            <p className="text-emerald-200">
              ✓ Preflop đúng chart: {label(pf.spot.kind, pf.actual)} {pf.hand} ở tình huống “{pf.spot.title}”.
            </p>
          ) : (
            <div className="rounded bg-red-500/10 p-2 text-red-100">
              <p>
                ✗ Preflop: bạn {label(pf.spot.kind, pf.actual)} {pf.hand}, chart khuyên{' '}
                <b>{label(pf.spot.kind, pf.expected)}</b> (“{pf.spot.title}”).
              </p>
              <p className="mt-1 text-xs text-red-100/70">{pf.spot.tip}</p>
            </div>
          )
        ) : (
          analysis.handClass && (
            <p className="text-white/50">Tình huống preflop này chưa có trong chart (nhiều người vào pot trước bạn, hoặc bạn ở BB không ai raise).</p>
          )
        )}
        {ai && (
          <p>
            All-in ở {STREET_VI[ai.street]} với {analysis.handClass} gặp {cardsToString(ai.opponentCards)} của {ai.opponent}: equity{' '}
            <b className="font-mono">{pct(ai.equity)}</b>. Kỳ vọng {signed(ai.expectedNet / bb)}bb, thực tế {signed(ai.actualNet / bb)}bb
            {Math.abs(ai.actualNet - ai.expectedNet) / bb >= 1 && (
              <span className={ai.actualNet > ai.expectedNet ? ' text-emerald-300' : ' text-red-300'}>
                {' '}
                ({ai.actualNet > ai.expectedNet ? 'hên' : 'xui'} {Math.abs((ai.actualNet - ai.expectedNet) / bb).toFixed(1)}bb)
              </span>
            )}
            .{' '}
            {ai.equity >= 0.5
              ? 'Bạn đưa tiền vào khi đang dẫn: quyết định tốt dù kết quả ra sao.'
              : 'Bạn đưa tiền vào khi đang bị dẫn. Xem lại: lúc đó pot odds có đủ không?'}
          </p>
        )}
      </section>

      <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
        <summary className="cursor-pointer text-white/60">Văn bản gốc</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-white/70">{rec.raw}</pre>
      </details>
    </div>
  );
}

function label(kind: 'rfi' | 'vs-open', action: 'fold' | 'call' | 'raise') {
  if (kind === 'rfi' && action === 'call') return 'limp';
  return ACTION_LABELS[kind][action].toLowerCase();
}
