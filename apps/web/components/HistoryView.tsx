'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  analyzeHand,
  cardToString,
  parseHand,
  parseHandHistories,
  summarize,
  type HandAnalysis,
  type HandRecord,
} from '@poker/engine';
import HistoryStats from './HistoryStats';
import HandReview from './HandReview';
import PlayingCard from './PlayingCard';
import { addHands, loadHands, removeHands, type StoredHand } from '@/lib/historyStore';

type Source = 'all' | StoredHand['source'];
type Filter = 'all' | 'chart' | 'allin' | 'bigloss' | 'bigwin' | 'showdown';

const FILTERS: { id: Filter; label: string; test: (a: HandAnalysis) => boolean }[] = [
  { id: 'all', label: 'Tất cả', test: () => true },
  { id: 'chart', label: 'Sai chart', test: (a) => a.preflop !== null && !a.preflop.correct },
  { id: 'bigloss', label: 'Thua ≥ 20bb', test: (a) => a.netBB <= -20 },
  { id: 'bigwin', label: 'Thắng ≥ 20bb', test: (a) => a.netBB >= 20 },
  { id: 'showdown', label: 'Showdown', test: (a) => a.showdown },
  { id: 'allin', label: 'All-in', test: (a) => a.allIn !== null },
];
const PAGE = 50;

interface Item {
  stored: StoredHand;
  record: HandRecord;
}

export default function HistoryView() {
  const [stored, setStored] = useState<StoredHand[] | null>(null);
  const [source, setSource] = useState<Source>('all');
  const [heroPick, setHeroPick] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => setStored(loadHands()), []);

  // Newest first. Stored text was valid when saved, but guard against edits by hand.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const s of stored ?? []) {
      try {
        out.push({ stored: s, record: parseHand(s.text) });
      } catch {
        /* skip */
      }
    }
    return out.reverse();
  }, [stored]);

  const inSource = useMemo(() => items.filter((it) => source === 'all' || it.stored.source === source), [items, source]);

  const heroes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of inSource) if (it.record.hero) counts.set(it.record.hero, (counts.get(it.record.hero) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [inSource]);
  const hero = heroPick && heroes.some(([h]) => h === heroPick) ? heroPick : (heroes[0]?.[0] ?? null);

  const analyses = useMemo(() => {
    if (!hero) return [];
    const out: { key: string; a: HandAnalysis }[] = [];
    for (const it of inSource) {
      if (it.record.hero !== hero) continue;
      const a = analyzeHand(it.record, hero, { iterations: 4000 });
      if (a) out.push({ key: it.stored.key, a });
    }
    return out;
  }, [inSource, hero]);

  const summary = useMemo(() => (analyses.length ? summarize(analyses.map((x) => x.a)) : null), [analyses]);
  const filterTest = FILTERS.find((f) => f.id === filter)!.test;
  const visible = analyses.filter((x) => filterTest(x.a));
  const current = analyses.find((x) => x.key === selected) ?? visible[0] ?? null;

  useEffect(() => setShown(PAGE), [filter, source, hero]);

  const importTexts = (texts: string[]) => {
    const parsed = texts.map(parseHandHistories);
    const hands = parsed.flatMap((p) => p.hands);
    const errors = parsed.flatMap((p) => p.errors);
    if (hands.length === 0 && errors.length === 0) {
      setMessage({ tone: 'warn', text: 'Không tìm thấy ván nào. Văn bản cần bắt đầu bằng dòng “PokerStars Hand #…”.' });
      return;
    }
    const { hands: next, added } = addHands(
      hands.map((h) => h.raw),
      'import',
    );
    setStored(next);
    const parts = [`Đã thêm ${added} ván`];
    if (hands.length > added) parts.push(`bỏ qua ${hands.length - added} ván đã có`);
    if (errors.length) {
      const reasons = [...new Set(errors.map((e) => e.message))].slice(0, 3).join('; ');
      parts.push(`${errors.length} ván không đọc được (${reasons})`);
    }
    setMessage({ tone: errors.length || added === 0 ? 'warn' : 'ok', text: `${parts.join(', ')}.` });
    if (added) {
      setPasted('');
      setSource('all');
      setFilter('all');
      setSelected(null);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    importTexts(await Promise.all([...files].map((f) => f.text())));
  };

  const download = () => {
    const text = inSource.map((it) => it.stored.text).join('\n\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-history-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    setStored(removeHands((h) => source !== 'all' && h.source !== source));
    setConfirmClear(false);
    setSelected(null);
    setMessage(null);
  };

  if (stored === null) return <p className="text-white/60">Đang tải…</p>;

  const importPanel = (
    <div className="space-y-3">
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={6}
        placeholder={'PokerStars Hand #250000000001:  Hold\'em No Limit ($0.01/$0.02 USD) - …\nTable \'…\' 6-max Seat #1 is the button\n…'}
        className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => importTexts([pasted])}
          disabled={!pasted.trim()}
          className="rounded-lg bg-chip px-4 py-2 text-sm font-semibold text-felt-950 hover:brightness-110 disabled:opacity-40"
        >
          Nhập văn bản
        </button>
        <label className="cursor-pointer rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
          Chọn file .txt
          <input
            type="file"
            accept=".txt,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-xs text-white/50">
          Hỗ trợ định dạng PokerStars, No-Limit Hold&apos;em. File nằm trong thư mục HandHistory của PokerStars.
        </span>
      </div>
      {message && (
        <p className={`text-sm ${message.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>{message.text}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Phân tích hand history</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/60">
          Các ván bạn chơi ở trang{' '}
          <Link href="/play" className="text-chip hover:underline">
            Chơi
          </Link>{' '}
          được lưu tự động trong trình duyệt này. Bạn cũng có thể nhập hand history PokerStars. Trang này tính chỉ số, so quyết định
          preflop với chart, tính equity lúc all-in và cho xem lại từng ván.
        </p>
      </div>

      {items.length === 0 ? (
        <section className="space-y-4 rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <p>
            Chưa có ván nào. Hãy{' '}
            <Link href="/play" className="text-chip hover:underline">
              chơi vài ván với bot
            </Link>{' '}
            hoặc dán hand history vào đây.
          </p>
          {importPanel}
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex overflow-hidden rounded-lg border border-white/15">
              {(
                [
                  ['all', 'Tất cả'],
                  ['play', 'Chơi với bot'],
                  ['import', 'Đã nhập'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setSource(id)}
                  className={`px-3 py-1.5 ${source === id ? 'bg-chip text-felt-950' : 'text-white/70 hover:bg-white/5'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {heroes.length > 1 && (
              <label className="flex items-center gap-2 text-white/70">
                Người chơi
                <select
                  value={hero ?? ''}
                  onChange={(e) => setHeroPick(e.target.value)}
                  className="rounded border border-white/15 bg-felt-900 px-2 py-1"
                >
                  {heroes.map(([h, c]) => (
                    <option key={h} value={h}>
                      {h} ({c})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button onClick={download} disabled={!inSource.length} className="text-white/70 hover:text-white disabled:opacity-40">
                Tải về .txt
              </button>
              {confirmClear ? (
                <span className="flex items-center gap-2">
                  <span className="text-amber-300">Xóa {inSource.length} ván?</span>
                  <button onClick={clear} className="rounded bg-red-600 px-2 py-0.5 font-semibold hover:brightness-110">
                    Xóa
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="text-white/60 hover:text-white">
                    Hủy
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={!inSource.length}
                  className="text-white/70 hover:text-red-300 disabled:opacity-40"
                >
                  Xóa…
                </button>
              )}
            </div>
          </section>

          <details className="rounded-xl border border-white/10 bg-felt-900/70 p-4" open={!!message}>
            <summary className="cursor-pointer font-semibold">Nhập thêm hand history</summary>
            <div className="mt-3">{importPanel}</div>
          </details>

          {summary ? (
            <HistoryStats s={summary} />
          ) : (
            <p className="text-sm text-white/60">Không có ván nào có bài của bạn trong nguồn này.</p>
          )}

          {analyses.length > 0 && (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => {
                    const n = f.id === 'all' ? analyses.length : analyses.filter((x) => f.test(x.a)).length;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${
                          filter === f.id ? 'border-chip bg-chip/20 text-chip' : 'border-white/15 text-white/70 hover:text-white'
                        }`}
                      >
                        {f.label} <span className="opacity-60">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <ul className="max-h-[720px] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10 bg-felt-900/70">
                  {visible.length === 0 && <li className="p-4 text-sm text-white/50">Không có ván nào khớp bộ lọc.</li>}
                  {visible.slice(0, shown).map(({ key, a }) => (
                    <li key={key}>
                      <button
                        onClick={() => setSelected(key)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                          current?.key === key ? 'bg-chip/15' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="w-9 shrink-0 text-xs text-white/60">{a.position}</span>
                        <span className="flex shrink-0 gap-0.5">
                          {(a.record.heroCards ?? []).map((c) => (
                            <PlayingCard key={cardToString(c)} code={cardToString(c)} size="sm" />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-white/50">
                          {a.record.date?.slice(5, 16) ?? `#${a.record.id}`}
                          {a.preflop && !a.preflop.correct && <span className="ml-1.5 text-red-300">sai chart</span>}
                          {a.allIn && <span className="ml-1.5 text-sky-300">all-in</span>}
                        </span>
                        <span className={`shrink-0 font-mono ${a.net > 0 ? 'text-emerald-300' : a.net < 0 ? 'text-red-300' : 'text-white/50'}`}>
                          {a.netBB > 0 ? '+' : ''}
                          {a.netBB.toFixed(1)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {visible.length > shown && (
                    <li>
                      <button onClick={() => setShown((x) => x + PAGE)} className="w-full py-2 text-sm text-chip hover:bg-white/5">
                        Xem thêm ({visible.length - shown})
                      </button>
                    </li>
                  )}
                </ul>
              </div>
              <div>{current ? <HandReview key={current.key} analysis={current.a} /> : null}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
