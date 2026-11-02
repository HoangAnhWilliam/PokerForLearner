import { isRed, SUIT_SYMBOL } from '@/lib/labels';

interface Props {
  code: string | null;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  onClick?: () => void;
  placeholder?: string;
}

const SIZES = {
  sm: 'h-9 w-7 text-xs',
  md: 'h-14 w-10 text-base',
  lg: 'h-20 w-14 text-xl',
};

export default function PlayingCard({ code, size = 'lg', active, onClick, placeholder }: Props) {
  const ring = active ? 'ring-2 ring-chip ring-offset-2 ring-offset-felt-900' : '';
  const base = `${SIZES[size]} ${ring} inline-flex flex-col items-center justify-center rounded-md font-semibold leading-none select-none`;
  if (!code) {
    return (
      <button type="button" onClick={onClick} className={`${base} border-2 border-dashed border-white/25 text-white/30 hover:border-white/50`}>
        {placeholder ?? '?'}
      </button>
    );
  }
  if (code === 'back') {
    return (
      <span
        className={`${base} border border-white/30 shadow-md`}
        style={{
          background:
            'repeating-linear-gradient(45deg, #7f1d1d 0 4px, #991b1b 4px 8px)',
        }}
      />
    );
  }
  const rank = code[0] === 'T' ? '10' : code[0];
  const face = (
    <>
      <span>{rank}</span>
      <span>{SUIT_SYMBOL[code[1]!]}</span>
    </>
  );
  const look = `${base} bg-white shadow-md ${isRed(code) ? 'text-red-600' : 'text-slate-900'}`;
  // A plain span when not clickable, so cards can sit inside other buttons (e.g. list rows).
  return onClick ? (
    <button type="button" onClick={onClick} className={look}>
      {face}
    </button>
  ) : (
    <span className={look}>{face}</span>
  );
}
