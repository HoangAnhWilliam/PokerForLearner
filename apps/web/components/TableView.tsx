import PlayingCard from './PlayingCard';

export interface TableSeat {
  key: string;
  name: string;
  /** Style badge for bots. */
  badge?: string | null;
  position: string;
  stack: string;
  /** Card codes, 'back' for face down, null to show nothing. */
  cards: string[] | null;
  big: boolean;
  folded: boolean;
  active: boolean;
  won: boolean;
  isButton: boolean;
  /** Text under the seat: last action or hand name. */
  label: string | null;
  /** Chips in front of the player, already formatted; null when none. */
  bet: string | null;
}

interface Props {
  seats: TableSeat[];
  board: string[];
  pot: string;
  /** Seat drawn at the bottom. */
  bottomIndex: number;
}

/** Oval table with seats around it. Purely presentational. */
export default function TableView({ seats, board, pot, bottomIndex }: Props) {
  const n = seats.length;
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-3xl sm:aspect-[16/10]">
      <div className="absolute inset-[16%_6%] rounded-[45%] border-[8px] border-[#3b2a1a] bg-gradient-to-b from-felt-600 to-felt-700 shadow-[inset_0_0_60px_rgba(0,0,0,0.55)] sm:inset-[15%_9%]" />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) =>
            board[i] ? (
              <PlayingCard key={i} code={board[i]!} size="md" />
            ) : (
              <span key={i} className="h-14 w-10 rounded-md border border-white/10 bg-black/10" />
            ),
          )}
        </div>
        <span className="rounded-full bg-black/40 px-3 py-0.5 text-sm text-chip">Pot {pot}</span>
      </div>

      {seats.map((seat, i) => {
        const k = (i - bottomIndex + n) % n;
        const angle = ((90 + (k * 360) / n) * Math.PI) / 180;
        const x = 50 + 43 * Math.cos(angle);
        const y = 50 + 41 * Math.sin(angle);
        const bx = 50 + 27 * Math.cos(angle);
        const by = 50 + 24 * Math.sin(angle);

        return (
          <div key={seat.key}>
            <div
              className={`absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-opacity sm:w-32 ${
                seat.folded ? 'opacity-40' : ''
              }`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className="flex min-h-9 gap-0.5">
                {seat.cards?.map((c, j) => <PlayingCard key={j} code={c} size={seat.big ? 'md' : 'sm'} />)}
              </div>
              <div
                className={`w-full rounded-lg border px-2 py-1 text-center text-xs ${
                  seat.won
                    ? 'border-chip bg-chip/25'
                    : seat.active
                      ? 'border-chip bg-felt-900 shadow-[0_0_16px_rgba(233,185,73,0.5)]'
                      : 'border-white/15 bg-felt-950/90'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="truncate font-semibold">{seat.name}</span>
                  {seat.isButton && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-slate-900">
                      D
                    </span>
                  )}
                </div>
                <div className="flex justify-between gap-1 text-[10px] text-white/60">
                  <span>{seat.position}</span>
                  {seat.badge && <span className="text-white/50">{seat.badge}</span>}
                  <span className="font-mono text-white/90">{seat.stack}</span>
                </div>
              </div>
              {seat.label && (
                <span className={`text-[11px] ${seat.won ? 'font-semibold text-chip' : 'text-white/70'}`}>{seat.label}</span>
              )}
            </div>
            {seat.bet && (
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-chip/60 bg-black/60 px-1.5 font-mono text-[11px] text-chip"
                style={{ left: `${bx}%`, top: `${by}%` }}
              >
                {seat.bet}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
