import Link from 'next/link';

const tools = [
  { href: '/calculator', title: 'Máy tính equity & pot odds', desc: 'Chọn bài, xem tỉ lệ thắng, đếm outs và quyết định call hay fold.', ready: true },
  { href: '/preflop', title: 'Preflop trainer', desc: 'Flashcard theo vị trí: mở bài, 3-bet, call hay fold. Câu sai sẽ được hỏi lại.', ready: true },
  { href: '/charts', title: 'Chart preflop', desc: 'Xem range mở bài và phản ứng khi gặp raise cho từng vị trí.', ready: true },
  { href: '/play', title: 'Chơi với bot', desc: 'Bàn 6-max với 4 phong cách đối thủ, có gợi ý equity, pot odds và chart khi tới lượt bạn.', ready: true },
  { href: '/history', title: 'Phân tích hand history', desc: 'Xem lại ván đã chơi hoặc nhập từ PokerStars: chỉ số VPIP/PFR, lỗi preflop, equity lúc all-in.', ready: true },
  { href: '#', title: 'Lộ trình học', desc: 'Bài học từ cơ bản đến nâng cao, kèm bài tập.', ready: false },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="font-display text-4xl">Luyện Texas Hold&apos;em</h1>
        <p className="max-w-2xl text-white/70">
          Cash game 6-max cho người mới bắt đầu. Bắt đầu với máy tính để hiểu equity và pot odds, phần còn lại sẽ được thêm dần.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) =>
          t.ready ? (
            <Link key={t.title} href={t.href} className="rounded-xl border border-chip/40 bg-felt-900/70 p-5 transition hover:border-chip hover:bg-felt-800">
              <h2 className="font-display text-xl text-chip">{t.title}</h2>
              <p className="mt-1 text-sm text-white/70">{t.desc}</p>
            </Link>
          ) : (
            <div key={t.title} className="rounded-xl border border-white/10 bg-felt-900/40 p-5 opacity-60">
              <h2 className="font-display text-xl">{t.title}</h2>
              <p className="mt-1 text-sm text-white/60">{t.desc}</p>
              <span className="mt-3 inline-block rounded bg-white/10 px-2 py-0.5 text-xs">Sắp có</span>
            </div>
          ),
        )}
      </section>
    </div>
  );
}
