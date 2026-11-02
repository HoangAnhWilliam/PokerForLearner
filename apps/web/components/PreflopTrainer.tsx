'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTION_LABELS,
  makeQuestion,
  sampleQuestion,
  SPOTS_6MAX_100BB,
  type HandClass,
  type PreflopAction,
  type PreflopQuestion,
} from '@poker/engine';
import PokerTable from './PokerTable';
import RangeGrid from './RangeGrid';
import { pct } from '@/lib/labels';

type SpotStats = Record<string, { seen: number; correct: number }>;
interface ReviewItem {
  spotId: string;
  hand: HandClass;
  due: number;
  stage: 0 | 1;
}

const BUTTON_STYLE: Record<PreflopAction, string> = {
  fold: 'bg-slate-600 text-white',
  call: 'bg-sky-600 text-white',
  raise: 'bg-rose-600 text-white',
};

const STATS_KEY = 'poker.preflop.stats.v1';
const SPOTS_KEY = 'poker.preflop.spots.v1';
const KEYS: Record<string, PreflopAction> = { f: 'fold', '1': 'fold', c: 'call', '2': 'call', r: 'raise', '3': 'raise' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: stats just won't persist */
  }
}

export default function PreflopTrainer() {
  const [selected, setSelected] = useState<string[]>(SPOTS_6MAX_100BB.map((s) => s.id));
  const [question, setQuestion] = useState<PreflopQuestion | null>(null);
  const [chosen, setChosen] = useState<PreflopAction | null>(null);
  const [session, setSession] = useState({ total: 0, correct: 0, streak: 0, best: 0 });
  const [stats, setStats] = useState<SpotStats>({});
  const [fromReview, setFromReview] = useState(false);
  const review = useRef<ReviewItem[]>([]);
  const counter = useRef(0);
  const lastWasReview = useRef(false);
  const [reviewCount, setReviewCount] = useState(0);

  const nextQuestion = useCallback(
    (spotIds: string[] = selected, prev: PreflopQuestion | null = question) => {
      counter.current++;
      // Never serve two review questions in a row, so new hands keep coming.
      const due = lastWasReview.current
        ? undefined
        : review.current.find((r) => r.due <= counter.current && spotIds.includes(r.spotId));
      lastWasReview.current = !!due;
      if (due) {
        const spot = SPOTS_6MAX_100BB.find((s) => s.id === due.spotId)!;
        setQuestion(makeQuestion(spot, due.hand));
        setFromReview(true);
      } else {
        const spots = SPOTS_6MAX_100BB.filter((s) => spotIds.includes(s.id));
        let q = sampleQuestion(spots);
        for (let i = 0; i < 5 && prev && q.hand === prev.hand && q.spot.id === prev.spot.id; i++) q = sampleQuestion(spots);
        setQuestion(q);
        setFromReview(false);
      }
      setChosen(null);
    },
    [selected, question],
  );

  // Load saved settings and the first question on the client only (random content).
  useEffect(() => {
    const savedSpots = load<string[]>(SPOTS_KEY, []).filter((id) => SPOTS_6MAX_100BB.some((s) => s.id === id));
    const spots = savedSpots.length ? savedSpots : SPOTS_6MAX_100BB.map((s) => s.id);
    setSelected(spots);
    setStats(load<SpotStats>(STATS_KEY, {}));
    nextQuestion(spots, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = useCallback(
    (action: PreflopAction) => {
      if (!question || chosen || !question.spot.actions.includes(action)) return;
      setChosen(action);
      const ok = action === question.answer;

      setSession((s) => {
        const streak = ok ? s.streak + 1 : 0;
        return { total: s.total + 1, correct: s.correct + (ok ? 1 : 0), streak, best: Math.max(s.best, streak) };
      });
      setStats((prev) => {
        const cur = prev[question.spot.id] ?? { seen: 0, correct: 0 };
        const next = { ...prev, [question.spot.id]: { seen: cur.seen + 1, correct: cur.correct + (ok ? 1 : 0) } };
        save(STATS_KEY, next);
        return next;
      });

      // Spaced repetition within the session: a miss comes back after 3 questions,
      // then once more after 8 before it is considered learned.
      const idx = review.current.findIndex((r) => r.spotId === question.spot.id && r.hand === question.hand);
      const existing = idx >= 0 ? review.current.splice(idx, 1)[0] : undefined;
      if (!ok) {
        review.current.push({ spotId: question.spot.id, hand: question.hand, due: counter.current + 3, stage: 0 });
      } else if (existing && existing.stage === 0) {
        review.current.push({ ...existing, due: counter.current + 8, stage: 1 });
      }
      setReviewCount(review.current.length);
    },
    [question, chosen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (!chosen && KEYS[k]) answer(KEYS[k]);
      else if (chosen && (k === ' ' || k === 'enter')) {
        e.preventDefault();
        nextQuestion();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, chosen, nextQuestion]);

  const toggleSpot = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (next.length === 0) return;
    setSelected(next);
    save(SPOTS_KEY, next);
    if (question && !next.includes(question.spot.id)) nextQuestion(next);
  };

  const resetStats = () => {
    setStats({});
    save(STATS_KEY, {});
  };

  if (!question) return <p className="text-white/60">Đang chia bài…</p>;

  const labels = ACTION_LABELS[question.spot.kind];
  const ok = chosen === question.answer;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Preflop trainer</h1>
        <p className="mt-1 text-sm text-white/60">
          Cash game 6-max, stack 100bb. Chọn hành động đúng theo chart. Phím tắt: <kbd>F</kbd> fold, <kbd>C</kbd> call,{' '}
          <kbd>R</kbd> raise, <kbd>Space</kbd> câu tiếp.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SPOTS_6MAX_100BB.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSpot(s.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                on ? 'border-chip bg-chip/15 text-chip' : 'border-white/15 text-white/50 hover:text-white'
              }`}
            >
              {s.title}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-xl border border-white/10 bg-felt-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{question.spot.title}</h2>
            {fromReview && <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">Ôn lại</span>}
          </div>
          <p className="text-sm text-white/70">
            {question.spot.kind === 'rfi'
              ? `Mọi người trước bạn đều fold. Bạn ở ${question.spot.hero}, cầm ${question.hand}.`
              : `${question.spot.opener} raise 2.5bb, những người còn lại fold. Bạn ở ${question.spot.hero}, cầm ${question.hand}.`}
          </p>

          <PokerTable spot={question.spot} cards={question.cards} />

          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${question.spot.actions.length}, minmax(0, 1fr))` }}>
            {question.spot.actions.map((a) => {
              const isAnswer = chosen && a === question.answer;
              const isWrongPick = chosen === a && !ok;
              return (
                <button
                  key={a}
                  disabled={!!chosen}
                  onClick={() => answer(a)}
                  className={`rounded-lg py-3 text-base font-semibold transition ${
                    isAnswer
                      ? 'bg-emerald-500 text-white'
                      : isWrongPick
                        ? 'bg-red-600 text-white'
                        : chosen
                          ? 'bg-white/5 text-white/30'
                          : `${BUTTON_STYLE[a]} hover:brightness-110`
                  }`}
                >
                  {labels[a]}
                  <span className="ml-2 text-xs font-normal opacity-60">{a[0]!.toUpperCase()}</span>
                </button>
              );
            })}
          </div>

          {chosen && (
            <div className={`rounded-lg p-3 text-sm ${ok ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
              <p className="font-semibold">
                {ok ? 'Chính xác!' : `Chưa đúng. Chart chọn ${labels[question.answer]} với ${question.hand}.`}
              </p>
              <p className="mt-1 text-white/70">{question.spot.tip}</p>
              <button
                onClick={() => nextQuestion()}
                className="mt-3 rounded bg-chip px-4 py-1.5 font-semibold text-felt-950 hover:brightness-110"
              >
                Câu tiếp <span className="text-xs opacity-60">(Space)</span>
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-mono text-2xl text-chip">{session.total ? pct(session.correct / session.total) : '–'}</p>
                <p className="text-xs text-white/50">
                  Đúng {session.correct}/{session.total}
                </p>
              </div>
              <div>
                <p className="font-mono text-2xl">{session.streak}</p>
                <p className="text-xs text-white/50">Chuỗi (tốt nhất {session.best})</p>
              </div>
              <div>
                <p className="font-mono text-2xl">{reviewCount}</p>
                <p className="text-xs text-white/50">Chờ ôn lại</p>
              </div>
            </div>
          </section>

          {chosen ? (
            <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
              <h2 className="mb-3 font-semibold">Chart: {question.spot.title}</h2>
              <RangeGrid spot={question.spot} highlight={question.hand} />
            </section>
          ) : (
            <section className="rounded-xl border border-white/10 bg-felt-900/70 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Tỉ lệ đúng theo tình huống</h2>
                <button onClick={resetStats} className="text-xs text-white/40 hover:text-white">
                  Xóa
                </button>
              </div>
              <ul className="space-y-1.5 text-sm">
                {SPOTS_6MAX_100BB.map((s) => {
                  const st = stats[s.id];
                  return (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span className="text-white/70">{s.title}</span>
                      <span className="font-mono">{st ? `${pct(st.correct / st.seen)} · ${st.seen}` : '–'}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-white/40">Chart sẽ hiện ở đây sau khi bạn trả lời.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
