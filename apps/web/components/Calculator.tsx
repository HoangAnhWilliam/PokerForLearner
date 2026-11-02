'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  callEV,
  cardToString,
  countOuts,
  evaluate,
  hitProbability,
  HandCategory,
  parseCard,
  potOdds,
  ruleOf2And4,
  type EquityResult,
} from '@poker/engine';
import PlayingCard from './PlayingCard';
import { CATEGORY_VI, isRed, pct, SUIT_SYMBOL } from '@/lib/labels';
import type { EquityRequest } from '@/workers/equity.worker';

type Group = 'hero' | 'villain' | 'board';
type Slots = Record<Group, (string | null)[]>;
type SlotRef = { group: Group; index: number };

const RANKS = 'AKQJT98765432'.split('');
const SUITS = ['s', 'h', 'd', 'c'];
const emptySlots = (): Slots => ({ hero: [null, null], villain: [null, null], board: [null, null, null, null, null] });
const ORDER: SlotRef[] = [
  { group: 'hero', index: 0 },
  { group: 'hero', index: 1 },
  { group: 'villain', index: 0 },
  { group: 'villain', index: 1 },
  ...[0, 1, 2, 3, 4].map((index) => ({ group: 'board' as const, index })),
];

const filled = (xs: (string | null)[]) => xs.filter((x): x is string => x !== null);

export default function Calculator() {
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [active, setActive] = useState<SlotRef | null>({ group: 'hero', index: 0 });
  const [villainRandom, setVillainRandom] = useState(true);
  const [pot, setPot] = useState('100');
  const [toCall, setToCall] = useState('50');
  const [result, setResult] = useState<EquityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  const hero = filled(slots.hero);
  const villain = filled(slots.villain);
  const board = filled(slots.board);
  const used = new Set([...hero, ...(villainRandom ? [] : villain), ...board]);

  const boardValid = [0, 3, 4, 5].includes(board.length);
  const ready = hero.length === 2 && (villainRandom || villain.length === 2) && boardValid;

  useEffect(() => {
    const w = new Worker(new URL('../workers/equity.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; result?: EquityResult }>) => {
      if (e.data.id !== reqId.current) return;
      setLoading(false);
      setResult(e.data.result ?? null);
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const key = `${hero.join()}|${villainRandom ? 'R' : villain.join()}|${board.join()}`;
  useEffect(() => {
    if (!ready || !workerRef.current) {
      setResult(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const msg: EquityRequest = {
      id,
      hero: hero.join(' '),
      villain: villainRandom ? null : villain.join(' '),
      board: board.join(' '),
    };
    const t = setTimeout(() => workerRef.current?.postMessage(msg), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const nextEmpty = (s: Slots, from: SlotRef | null): SlotRef | null => {
    const start = from ? ORDER.findIndex((o) => o.group === from.group && o.index === from.index) : -1;
    for (let i = 1; i <= ORDER.length; i++) {
      const o = ORDER[(start + i) % ORDER.length]!;
      if (o.group === 'villain' && villainRandom) continue;
      if (s[o.group][o.index] === null) return o;
    }
    return null;
  };

  const pick = (code: string) => {
    if (used.has(code)) return;
    const target = active ?? nextEmpty(slots, null);
    if (!target) return;
    const next: Slots = { ...slots, [target.group]: slots[target.group].slice() };
    next[target.group][target.index] = code;
    setSlots(next);
    setActive(nextEmpty(next, target));
  };

  const clearSlot = (ref: SlotRef) => {
    const next: Slots = { ...slots, [ref.group]: slots[ref.group].slice() };
    next[ref.group][ref.index] = null;
    setSlots(next);
    setActive(ref);
  };

  const clearGroup = (group: Group) => {
    setSlots({ ...slots, [group]: slots[group].map(() => null) });
    setActive({ group, index: 0 });
  };

  const randomFill = () => {
    const deck = SUITS.flatMap((s) => RANKS.map((r) => r + s)).filter((c) => !used.has(c));
    const next: Slots = { ...slots, hero: slots.hero.slice() };
    for (let i = 0; i < 2; i++) {
      if (!next.hero[i]) next.hero[i] = deck.splice(Math.floor(Math.random() * deck.length), 1)[0]!;
    }
    setSlots(next);
    setActive(nextEmpty(next, null));
  };

  // Current made hands and outs (cheap, done on main thread)
  const heroHand = useMemo(
    () => (hero.length === 2 && board.length >= 3 ? evaluate([...hero, ...board].map(parseCard)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const villainHand = useMemo(
    () => (!villainRandom && villain.length === 2 && board.length >= 3 ? evaluate([...villain, ...board].map(parseCard)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const outs = useMemo(() => {
    if (hero.length !== 2 || (board.length !== 3 && board.length !== 4)) return null;
    const r = countOuts(hero.map(parseCard), board.map(parseCard));
    // Remove cards held by a known villain
    const details = r.details
      .map((d) => ({ code: cardToString(d.card), category: d.category }))
      .filter((d) => !used.has(d.code));
    const cardsToCome = (board.length === 3 ? 2 : 1) as 1 | 2;
    const unseen = 52 - used.size;
    const groups = new Map<HandCategory, string[]>();
    for (const d of details) groups.set(d.category, [...(groups.get(d.category) ?? []), d.code]);
    return {
      count: details.length,
      groups: [...groups.entries()].sort((a, b) => b[0] - a[0]),
      cardsToCome,
      exact: hitProbability(details.length, unseen, cardsToCome),
      estimate: ruleOf2And4(details.length, cardsToCome),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const potNum = Number(pot);
  const callNum = Number(toCall);
  const odds = potNum >= 0 && callNum > 0 ? potOdds(potNum, callNum) : null;
  const heroEq = result?.equities[0];
  const ev = odds && heroEq !== undefined ? callEV(potNum, callNum, heroEq) : null;

  const slotRow = (group: Group, labels?: string[]) =>
    slots[group].map((code, index) => (
      <PlayingCard
        key={index}
        code={code}
        placeholder={labels?.[index]}
        active={active?.group === group && active.index === index}
        onClick={() => (code ? clearSlot({ group, index }) : setActive({ group, index }))}
      />
    ));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Máy tính equity & pot odds</h1>
        <p className="mt-1 text-sm text-white/60">
          Bấm vào ô trống rồi chọn lá bài bên dưới. Bấm vào lá đã chọn để bỏ nó đi.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Bài của bạn</h2>
            <div className="flex gap-3 text-xs text-white/60">
              <button onClick={randomFill} className="hover:text-white">Ngẫu nhiên</button>
              <button onClick={() => clearGroup('hero')} className="hover:text-white">Xóa</button>
            </div>
          </div>
          <div className="mt-3 flex gap-2">{slotRow('hero')}</div>
          {heroHand && <p className="mt-2 text-sm text-chip">{CATEGORY_VI[heroHand.category]}</p>}
        </section>

        <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Đối thủ</h2>
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={villainRandom}
                onChange={(e) => {
                  setVillainRandom(e.target.checked);
                  if (e.target.checked && active?.group === 'villain') setActive(null);
                }}
                className="accent-[var(--color-chip)]"
              />
              Bài ngẫu nhiên
            </label>
          </div>
          {villainRandom ? (
            <p className="mt-3 text-sm text-white/60">
              Đối thủ có thể cầm bất kỳ 2 lá nào. Bỏ chọn để nhập bài cụ thể.
            </p>
          ) : (
            <>
              <div className="mt-3 flex gap-2">{slotRow('villain')}</div>
              {villainHand && <p className="mt-2 text-sm text-white/70">{CATEGORY_VI[villainHand.category]}</p>}
            </>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-white/10 bg-felt-700/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Bàn (flop · turn · river)</h2>
          <button onClick={() => clearGroup('board')} className="text-xs text-white/60 hover:text-white">Xóa</button>
        </div>
        <div className="mt-3 flex gap-2">
          {slotRow('board', ['F', 'F', 'F', 'T', 'R'])}
        </div>
        {!boardValid && <p className="mt-2 text-sm text-amber-300">Bàn cần 0, 3, 4 hoặc 5 lá.</p>}
      </section>

      <section className="rounded-xl border border-white/10 bg-felt-900/70 p-4">
        <div className="space-y-1.5">
          {SUITS.map((s) => (
            <div key={s} className="flex flex-wrap gap-1.5">
              {RANKS.map((r) => {
                const code = r + s;
                const taken = used.has(code);
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={taken}
                    onClick={() => pick(code)}
                    className={`flex h-10 w-8 flex-col items-center justify-center rounded text-xs font-semibold leading-none transition sm:h-11 sm:w-9 sm:text-sm ${
                      taken ? 'bg-white/10 text-white/20' : `bg-white hover:-translate-y-0.5 ${isRed(code) ? 'text-red-600' : 'text-slate-900'}`
                    }`}
                  >
                    <span>{r === 'T' ? '10' : r}</span>
                    <span>{SUIT_SYMBOL[s]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <h2 className="font-semibold">Equity</h2>
          {!ready ? (
            <p className="mt-2 text-sm text-white/60">Chọn 2 lá của bạn để bắt đầu.</p>
          ) : !result ? (
            <p className="mt-2 text-sm text-white/60">Đang tính…</p>
          ) : (
            <div className={`mt-3 space-y-3 ${loading ? 'opacity-50' : ''}`}>
              {[
                { name: 'Bạn', eq: result.equities[0]!, color: 'bg-chip' },
                { name: villainRandom ? 'Đối thủ (ngẫu nhiên)' : 'Đối thủ', eq: result.equities[1]!, color: 'bg-white/40' },
              ].map((p) => (
                <div key={p.name}>
                  <div className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="font-mono">{pct(p.eq)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-white/10">
                    <div className={`h-2 rounded ${p.color}`} style={{ width: `${p.eq * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-white/50">
                {result.exact
                  ? `Tính chính xác trên ${result.samples.toLocaleString('vi-VN')} trường hợp.`
                  : `Ước lượng Monte Carlo, ${result.samples.toLocaleString('vi-VN')} lần mô phỏng.`}{' '}
                Hòa: {pct(result.ties[0]! / result.samples)}.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <h2 className="font-semibold">Outs</h2>
          {!outs ? (
            <p className="mt-2 text-sm text-white/60">Có ở flop hoặc turn: những lá giúp tay bạn lên hạng.</p>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl text-chip">{outs.count}</span>
                <span className="text-sm">outs</span>
              </div>
              <div className="text-sm">
                <p>
                  Trúng ít nhất 1 out {outs.cardsToCome === 2 ? 'đến river' : 'ở river'}:{' '}
                  <span className="font-mono text-chip">{pct(outs.exact)}</span>
                </p>
                <p className="text-xs text-white/50">
                  Nhẩm theo quy tắc {outs.cardsToCome === 2 ? '4' : '2'}: {outs.count} × {outs.cardsToCome === 2 ? 4 : 2} ≈{' '}
                  {pct(outs.estimate)}
                  {outs.count > 12 && outs.cardsToCome === 2 ? ' (quy tắc nhẩm kém chính xác khi nhiều outs)' : ''}
                </p>
              </div>
              {outs.groups.map(([cat, codes]) => (
                <div key={cat}>
                  <p className="text-xs text-white/60">
                    {CATEGORY_VI[cat]} · {codes.length}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {codes.map((c) => (
                      <PlayingCard key={c} code={c} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-white/50">
                Chỉ tính lá giúp tay bạn lên hạng (không tính lá chỉ tạo đôi trên bàn). Chưa xét bài đối thủ, nên một số out vẫn có thể thua.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <h2 className="font-semibold">Pot odds</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-white/60">Pot hiện tại</span>
              <input value={pot} onChange={(e) => setPot(e.target.value)} inputMode="decimal" className="w-full rounded bg-black/30 px-2 py-1.5 font-mono" />
            </label>
            <label className="space-y-1">
              <span className="text-white/60">Cần call</span>
              <input value={toCall} onChange={(e) => setToCall(e.target.value)} inputMode="decimal" className="w-full rounded bg-black/30 px-2 py-1.5 font-mono" />
            </label>
          </div>
          {odds ? (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                Tỉ lệ pot: <span className="font-mono">{odds.ratio.toFixed(1)} : 1</span>
              </p>
              <p>
                Cần equity tối thiểu: <span className="font-mono text-chip">{pct(odds.requiredEquity)}</span>
              </p>
              {ev !== null && heroEq !== undefined && (
                <p className={`mt-2 rounded px-2 py-1.5 ${ev >= 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>
                  {ev >= 0 ? 'Call có lời' : 'Nên fold'}: EV {ev >= 0 ? '+' : ''}
                  {ev.toFixed(1)} chip ({pct(heroEq)} so với {pct(odds.requiredEquity)} cần có)
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-300">Nhập số hợp lệ (cần call &gt; 0).</p>
          )}
        </section>
      </div>
    </div>
  );
}
