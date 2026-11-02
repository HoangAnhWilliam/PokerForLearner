'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTION_LABELS,
  applyAction,
  BOT_PROFILES,
  chenScore,
  correctAction,
  countOuts,
  decideBotAction,
  equity,
  evaluate,
  handClassOf,
  legalActions,
  positionOf,
  potTotal,
  SPOTS_6MAX_100BB,
  startHand,
  toPokerStars,
  type BotStyle,
  type HandState,
  type PlayerAction,
} from '@poker/engine';
import GameTable, { type SeatInfo } from './GameTable';
import { CATEGORY_VI, pct } from '@/lib/labels';
import { eventText, fmtBB } from '@/lib/format';
import { addHands } from '@/lib/historyStore';
import Link from 'next/link';

const SB = 1;
const BB = 2;
const BUY_IN = 200; // 100bb
const HERO = 0;

interface Seat {
  id: string;
  name: string;
  style: BotStyle | null;
  stack: number;
}

const INITIAL_SEATS: Seat[] = [
  { id: 'you', name: 'Bạn', style: null, stack: BUY_IN },
  { id: 'b1', name: 'Minh', style: 'tag', stack: BUY_IN },
  { id: 'b2', name: 'Lan', style: 'lag', stack: BUY_IN },
  { id: 'b3', name: 'Tuấn', style: 'station', stack: BUY_IN },
  { id: 'b4', name: 'Hoa', style: 'nit', stack: BUY_IN },
  { id: 'b5', name: 'Phong', style: 'tag', stack: BUY_IN },
];

const SETTINGS_KEY = 'poker.play.settings.v1';

export default function PlayGame() {
  const [seats, setSeats] = useState<Seat[]>(INITIAL_SEATS);
  const [button, setButton] = useState(0);
  const [hand, setHand] = useState<HandState | null>(null);
  const [heroBuyIns, setHeroBuyIns] = useState(1);
  const [handsPlayed, setHandsPlayed] = useState(0);
  const [showHints, setShowHints] = useState(true);
  const [showStyles, setShowStyles] = useState(true);
  const [raiseTo, setRaiseTo] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { hints?: boolean; styles?: boolean };
      if (saved.hints !== undefined) setShowHints(saved.hints);
      if (saved.styles !== undefined) setShowStyles(saved.styles);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ hints: showHints, styles: showStyles }));
    } catch {
      /* ignore */
    }
  }, [showHints, showStyles]);

  const dealNext = useCallback(
    (current: Seat[], btn: number) => {
      let rebuys = 0;
      const ready = current.map((s) => {
        if (s.stack > 0) return s;
        if (s.style === null) rebuys++;
        return { ...s, stack: BUY_IN };
      });
      if (rebuys) setHeroBuyIns((b) => b + rebuys);
      setSeats(ready);
      setButton(btn);
      setHand(startHand({ seats: ready, button: btn, sb: SB, bb: BB }));
    },
    [],
  );

  // First hand on the client only (random cards).
  useEffect(() => {
    dealNext(INITIAL_SEATS, Math.floor(Math.random() * INITIAL_SEATS.length));
  }, [dealNext]);

  // When the hand ends, carry the stacks over to the seats.
  useEffect(() => {
    if (!hand?.complete) return;
    setSeats((prev) => prev.map((s) => ({ ...s, stack: hand.players.find((p) => p.id === s.id)!.stack })));
    setHandsPlayed((n) => n + 1);
    // Saved for review on /history. The hand number only needs to be unique per browser.
    addHands([toPokerStars(hand, { handId: Date.now(), heroId: 'you', table: 'Bàn luyện tập' })], 'play');
  }, [hand?.complete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bots act after a short pause.
  useEffect(() => {
    if (!hand || hand.complete || hand.toAct === null || hand.toAct === HERO) return;
    const idx = hand.toAct;
    const heroFolded = hand.players[HERO]!.folded;
    const t = setTimeout(
      () => {
        setHand((h) => {
          if (!h || h.toAct !== idx) return h;
          const style = seats[idx]!.style!;
          return applyAction(h, decideBotAction(h, BOT_PROFILES[style]));
        });
      },
      heroFolded ? 250 : 650,
    );
    return () => clearTimeout(t);
  }, [hand, seats]);

  const heroTurn = !!hand && !hand.complete && hand.toAct === HERO;
  const legal = useMemo(() => (hand && heroTurn ? legalActions(hand) : null), [hand, heroTurn]);

  useEffect(() => {
    if (legal?.minRaiseTo != null) setRaiseTo(legal.minRaiseTo);
  }, [legal]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [hand?.events.length]);

  const act = useCallback(
    (a: PlayerAction) => {
      setHand((h) => (h && h.toAct === HERO ? applyAction(h, a) : h));
    },
    [],
  );

  const nextHand = useCallback(() => {
    if (!hand?.complete) return;
    dealNext(seats, (button + 1) % seats.length);
  }, [hand, seats, button, dealNext]);

  const pot = hand ? potTotal(hand) : 0;
  const presets = useMemo(() => {
    if (!hand || !legal || legal.minRaiseTo === null || legal.maxRaiseTo === null) return [];
    const clamp = (x: number) => Math.max(legal.minRaiseTo!, Math.min(legal.maxRaiseTo!, Math.round(x)));
    const list: { label: string; to: number }[] = [{ label: 'Min', to: legal.minRaiseTo }];
    const unopened = hand.street === 'preflop' && hand.currentBet === BB;
    if (unopened) {
      list.push({ label: '2.5bb', to: clamp(BB * 2.5) }, { label: '3bb', to: clamp(BB * 3) });
    } else if (hand.street === 'preflop') {
      list.push({ label: '3x', to: clamp(hand.currentBet * 3) });
    } else {
      for (const [label, f] of [
        ['½ pot', 0.5],
        ['¾ pot', 0.75],
        ['Pot', 1],
      ] as const)
        list.push({ label, to: clamp(hand.currentBet + (pot + legal.call) * f) });
    }
    list.push({ label: 'All-in', to: legal.maxRaiseTo });
    return list.filter((p, i, arr) => arr.findIndex((q) => q.to === p.to) === i);
  }, [hand, legal, pot]);

  const doRaise = useCallback(() => {
    if (!legal || legal.minRaiseTo === null || !hand) return;
    const to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo!, Math.round(raiseTo)));
    act({ type: hand.currentBet === 0 ? 'bet' : 'raise', amount: to });
  }, [legal, raiseTo, hand, act]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      const k = e.key.toLowerCase();
      if (hand?.complete && (k === 'n' || k === ' ' || k === 'enter')) {
        e.preventDefault();
        nextHand();
      } else if (legal) {
        if (k === 'f' && !legal.check) act({ type: 'fold' });
        else if (k === 'c') act(legal.check ? { type: 'check' } : { type: 'call' });
        else if (k === 'r') doRaise();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hand, legal, act, doRaise, nextHand]);

  const seatInfo: SeatInfo[] = seats.map((s) => ({
    id: s.id,
    label: s.name,
    badge: s.style && showStyles ? BOT_PROFILES[s.style].label : null,
  }));
  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? id;
  const heroStack = seats[HERO]!.stack;
  const net = heroStack - heroBuyIns * BUY_IN;

  if (!hand) return <p className="text-white/60">Đang chia bài…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Chơi với bot</h1>
          <p className="mt-1 text-sm text-white/60">
            Cash game 6-max, blind 0.5/1bb, stack 100bb. Phím tắt: <kbd>F</kbd> fold, <kbd>C</kbd> check/call,{' '}
            <kbd>R</kbd> raise, <kbd>N</kbd> ván tiếp. Mọi ván được lưu để{' '}
            <Link href="/history" className="text-chip underline-offset-2 hover:underline">
              xem lại và phân tích
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5 text-white/70">
            <input type="checkbox" checked={showHints} onChange={(e) => setShowHints(e.target.checked)} className="accent-[var(--color-chip)]" />
            Gợi ý
          </label>
          <label className="flex items-center gap-1.5 text-white/70">
            <input type="checkbox" checked={showStyles} onChange={(e) => setShowStyles(e.target.checked)} className="accent-[var(--color-chip)]" />
            Hiện phong cách bot
          </label>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <GameTable hand={hand} seats={seatInfo} heroIndex={HERO} />

          <section className="min-h-[96px] rounded-xl border border-white/10 bg-felt-900/80 p-4">
            {hand.complete ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 text-sm">
                  {hand.events
                    .filter((e) => e.kind === 'win')
                    .map((e, i) => (
                      <p key={i} className={e.playerId === 'you' ? 'font-semibold text-chip' : ''}>
                        {eventText(e, nameOf, BB)}
                        {!hand.showdown ? ' (không cần lật bài)' : ''}
                      </p>
                    ))}
                </div>
                <button onClick={nextHand} className="rounded-lg bg-chip px-5 py-2 font-semibold text-felt-950 hover:brightness-110">
                  Ván tiếp <span className="text-xs opacity-60">(N)</span>
                </button>
              </div>
            ) : heroTurn && legal ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {!legal.check && (
                    <button onClick={() => act({ type: 'fold' })} className="flex-1 rounded-lg bg-slate-600 py-2.5 font-semibold hover:brightness-110">
                      Fold <span className="text-xs opacity-60">F</span>
                    </button>
                  )}
                  <button
                    onClick={() => act(legal.check ? { type: 'check' } : { type: 'call' })}
                    className="flex-1 rounded-lg bg-sky-600 py-2.5 font-semibold hover:brightness-110"
                  >
                    {legal.check ? 'Check' : `Call ${fmtBB(legal.call, BB)}`} <span className="text-xs opacity-60">C</span>
                  </button>
                  {legal.minRaiseTo !== null && (
                    <button onClick={doRaise} className="flex-1 rounded-lg bg-rose-600 py-2.5 font-semibold hover:brightness-110">
                      {hand.currentBet === 0 ? 'Bet' : 'Raise'} {fmtBB(raiseTo, BB)}
                      {raiseTo === legal.maxRaiseTo ? ' (all-in)' : ''} <span className="text-xs opacity-60">R</span>
                    </button>
                  )}
                </div>
                {legal.minRaiseTo !== null && legal.maxRaiseTo !== null && legal.maxRaiseTo > legal.minRaiseTo && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="range"
                      min={legal.minRaiseTo}
                      max={legal.maxRaiseTo}
                      step={1}
                      value={raiseTo}
                      onChange={(e) => setRaiseTo(Number(e.target.value))}
                      className="min-w-40 flex-1 accent-rose-500"
                    />
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => setRaiseTo(p.to)}
                        className={`rounded border px-2 py-0.5 text-xs ${raiseTo === p.to ? 'border-rose-400 text-rose-200' : 'border-white/15 text-white/70 hover:text-white'}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/50">
                {hand.players[HERO]!.folded ? 'Bạn đã fold, chờ ván kết thúc…' : `${nameOf(hand.players[hand.toAct!]!.id)} đang suy nghĩ…`}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {showHints && heroTurn && <Hints hand={hand} />}

          <section className="rounded-xl border border-white/10 bg-felt-900/70 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className={`font-mono text-lg ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {net >= 0 ? '+' : ''}
                  {fmtBB(net, BB)}
                </p>
                <p className="text-[11px] text-white/50">Lời/lỗ</p>
              </div>
              <div>
                <p className="font-mono text-lg">{handsPlayed}</p>
                <p className="text-[11px] text-white/50">Ván</p>
              </div>
              <div>
                <p className="font-mono text-lg">{heroBuyIns}</p>
                <p className="text-[11px] text-white/50">Lần mua chip</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-felt-900/70 p-4">
            <h2 className="mb-2 text-sm font-semibold">Diễn biến ván</h2>
            <div ref={logRef} className="max-h-64 space-y-0.5 overflow-y-auto font-mono text-[11px] text-white/70">
              {hand.events.map((e, i) => (
                <p key={i} className={e.kind === 'street' ? 'pt-1 text-white/90' : e.kind === 'win' ? 'text-chip' : ''}>
                  {eventText(e, nameOf, BB)}
                </p>
              ))}
            </div>
          </section>

          {showStyles && (
            <section className="rounded-xl border border-white/10 bg-felt-900/70 p-4 text-xs text-white/60">
              <h2 className="mb-2 text-sm font-semibold text-white">Đối thủ</h2>
              <ul className="space-y-1.5">
                {(['tag', 'lag', 'station', 'nit'] as BotStyle[]).map((st) => (
                  <li key={st}>
                    <span className="font-semibold text-white/80">{BOT_PROFILES[st].label}</span>:{' '}
                    {BOT_PROFILES[st].description}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Learning aid shown on the hero's turn. */
function Hints({ hand }: { hand: HandState }) {
  const me = hand.players[HERO]!;
  const legal = legalActions(hand);
  const pot = potTotal(hand);
  const opponents = hand.players.filter((p) => !p.folded && p !== me).length;
  const hc = handClassOf(me.hole[0]!, me.hole[1]!);
  const pos = positionOf(hand, HERO);

  const eq = useMemo(
    () =>
      equity({
        players: [me.hole, ...Array.from({ length: opponents }, () => null)],
        board: hand.board,
        iterations: 2000,
      }).equities[0]!,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hand.board.length, opponents, me.hole[0], me.hole[1]],
  );

  let chartLine: string | null = null;
  if (hand.street === 'preflop') {
    const raises = hand.events.filter((e) => e.kind === 'action' && (e.type === 'raise' || e.type === 'bet'));
    if (raises.length === 0) {
      if (legal.check) chartLine = 'Mọi người chỉ limp: check để xem flop, hoặc raise với tay mạnh.';
      else {
        const spot = SPOTS_6MAX_100BB.find((s) => s.kind === 'rfi' && s.hero === pos);
        if (spot) chartLine = `Chart mở bài từ ${pos}: ${ACTION_LABELS.rfi[correctAction(spot, hc)]} với ${hc}.`;
      }
    } else if (raises.length === 1 && raises[0]!.kind === 'action') {
      const openerIdx = hand.players.findIndex((p) => p.id === (raises[0] as { playerId: string }).playerId);
      const openerPos = positionOf(hand, openerIdx);
      const spot = SPOTS_6MAX_100BB.find((s) => s.kind === 'vs-open' && s.hero === pos && s.opener === openerPos);
      if (spot) chartLine = `Chart ${pos} gặp ${openerPos} mở bài: ${ACTION_LABELS['vs-open'][correctAction(spot, hc)]} với ${hc}.`;
      else chartLine = `Chưa có chart cho ${pos} gặp ${openerPos}. Điểm Chen của ${hc}: ${chenScore(hc)} (từ 10 trở lên là tay mạnh).`;
    } else {
      chartLine = `Đã có ${raises.length} lần raise: chỉ tiếp tục với tay rất mạnh. Điểm Chen của ${hc}: ${chenScore(hc)}.`;
    }
  }

  const made = hand.board.length >= 3 ? CATEGORY_VI[evaluate([...me.hole, ...hand.board]).category] : null;
  const outs = hand.board.length === 3 || hand.board.length === 4 ? countOuts(me.hole, hand.board) : null;
  const required = legal.call > 0 ? legal.call / (pot + legal.call) : null;

  return (
    <section className="space-y-2 rounded-xl border border-chip/30 bg-felt-900/80 p-4 text-sm">
      <h2 className="font-semibold text-chip">Gợi ý</h2>
      <p className="text-white/70">
        Vị trí <b className="text-white">{pos}</b> · tay <b className="text-white">{hc}</b>
        {made && (
          <>
            {' '}
            · đang có <b className="text-white">{made}</b>
          </>
        )}
      </p>
      {chartLine && <p>{chartLine}</p>}
      <p>
        Equity với {opponents} đối thủ bài ngẫu nhiên: <b className="font-mono text-chip">{pct(eq)}</b>
      </p>
      {outs && outs.count > 0 && (
        <p className="text-white/70">
          {outs.count} outs, trúng ít nhất 1 {hand.board.length === 3 ? 'đến river' : 'ở river'}: {pct(outs.hitProbability)}
        </p>
      )}
      {required !== null && (
        <p>
          Cần call {fmtBB(legal.call, BB)} vào pot {fmtBB(pot, BB)} (gồm cả cược vòng này) → cần equity tối thiểu{' '}
          <b className="font-mono">{pct(required)}</b>.{' '}
          {hand.street !== 'preflop' &&
            (eq >= required ? (
              <span className="text-emerald-300">Theo pot odds, call có lời.</span>
            ) : (
              <span className="text-red-300">Theo pot odds, call bị lỗ.</span>
            ))}
        </p>
      )}
      <p className="text-[11px] text-white/40">
        Equity tính với bài ngẫu nhiên nên thường cao hơn thực tế: người đã raise thường cầm bài mạnh hơn ngẫu nhiên.
      </p>
    </section>
  );
}
