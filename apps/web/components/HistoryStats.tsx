import { POSITIONS, type HeroSummary } from '@poker/engine';
import Link from 'next/link';
import { pct } from '@/lib/labels';

const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;

const SEVERITY = {
  high: { label: 'Quan trọng', className: 'border-red-400/40 bg-red-500/10', badge: 'bg-red-500/30 text-red-100' },
  medium: { label: 'Nên sửa', className: 'border-amber-400/40 bg-amber-500/10', badge: 'bg-amber-500/30 text-amber-100' },
  info: { label: 'Ghi chú', className: 'border-white/15 bg-white/5', badge: 'bg-white/15 text-white/80' },
};

export default function HistoryStats({ s }: { s: HeroSummary }) {
  const tiles: { label: string; value: string; hint: string; tone?: 'good' | 'bad' }[] = [
    { label: 'Ván', value: String(s.hands), hint: 'Số ván bạn được chia bài' },
    {
      label: 'Lời/lỗ',
      value: `${signed(s.netBB)}bb`,
      hint: 'Tổng lời lỗ tính theo big blind',
      tone: s.netBB >= 0 ? 'good' : 'bad',
    },
    {
      label: 'bb/100',
      value: signed(s.bbPer100),
      hint: 'Lời lỗ trung bình mỗi 100 ván. Cần vài nghìn ván mới có ý nghĩa',
      tone: s.bbPer100 >= 0 ? 'good' : 'bad',
    },
    { label: 'VPIP', value: pct(s.vpip), hint: 'Tỉ lệ ván bạn tự bỏ tiền vào pot preflop (call hoặc raise). Gợi ý: 20–28%' },
    { label: 'PFR', value: pct(s.pfr), hint: 'Tỉ lệ ván bạn raise preflop. Gợi ý: gần VPIP, khoảng 16–22%' },
    {
      label: '3-bet',
      value: s.threeBet.opportunities ? pct(s.threeBet.made / s.threeBet.opportunities) : '–',
      hint: `Re-raise khi có đúng 1 người mở bài trước bạn (${s.threeBet.made}/${s.threeBet.opportunities} lần). Gợi ý: 6–10%`,
    },
    { label: 'WTSD', value: s.sawFlop ? pct(s.wtsd) : '–', hint: 'Trong các ván thấy flop, tỉ lệ đi tới showdown. Gợi ý: 25–33%' },
    { label: 'W$SD', value: s.showdowns ? pct(s.wsd) : '–', hint: 'Tỉ lệ thắng khi tới showdown. Gợi ý: trên 50%' },
    {
      label: 'AF',
      value: s.aggressionFactor === null ? '–' : s.aggressionFactor.toFixed(1),
      hint: 'Hệ số tấn công sau flop: (bet + raise) / call. Gợi ý: 2–4',
    },
    {
      label: 'Đúng chart',
      value: s.preflop.checked ? pct(s.preflop.correct / s.preflop.checked) : '–',
      hint: `Quyết định preflop khớp chart, trong ${s.preflop.checked} tình huống chart có`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} title={t.hint} className="rounded-lg border border-white/10 bg-felt-900/70 px-3 py-2">
            <p
              className={`font-mono text-xl ${t.tone === 'good' ? 'text-emerald-300' : t.tone === 'bad' ? 'text-red-300' : ''}`}
            >
              {t.value}
            </p>
            <p className="text-[11px] text-white/50">{t.label}</p>
          </div>
        ))}
      </div>
      {s.allIns > 0 && (
        <p className="text-sm text-white/60">
          {s.allIns} ván all-in có lật bài. Nếu mỗi lần all-in nhận đúng phần equity: {signed(s.allInAdjustedBB)}bb (thực tế{' '}
          {signed(s.netBB)}bb).
        </p>
      )}
      {s.hands < 100 && (
        <p className="text-xs text-white/40">
          Mẫu còn nhỏ ({s.hands} ván): các chỉ số dao động nhiều. Một số nhận xét chỉ xuất hiện khi đủ ván.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="space-y-2">
          <h2 className="font-semibold">Cần cải thiện</h2>
          {s.leaks.length === 0 ? (
            <p className="text-sm text-white/60">Chưa thấy lỗi rõ ràng. Chơi thêm ván để có thống kê đáng tin hơn.</p>
          ) : (
            s.leaks.map((l) => (
              <div key={l.id} className={`rounded-lg border p-3 text-sm ${SEVERITY[l.severity].className}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${SEVERITY[l.severity].badge}`}>{SEVERITY[l.severity].label}</span>
                  <span className="font-semibold">{l.title}</span>
                </div>
                <p className="mt-1 text-white/70">
                  {l.detail}
                  {l.id === 'chart' && (
                    <>
                      {' '}
                      <Link href="/preflop" className="text-chip hover:underline">
                        Mở Preflop trainer
                      </Link>
                    </>
                  )}
                </p>
              </div>
            ))
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Theo vị trí</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-white/50">
              <tr>
                <th className="py-1 font-normal">Vị trí</th>
                <th className="py-1 text-right font-normal">Ván</th>
                <th className="py-1 text-right font-normal">VPIP</th>
                <th className="py-1 text-right font-normal">bb/100</th>
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map((p) => {
                const st = s.byPosition[p];
                const rate = st.hands ? (st.netBB / st.hands) * 100 : 0;
                return (
                  <tr key={p} className="border-t border-white/5">
                    <td className="py-1">{p}</td>
                    <td className="py-1 text-right font-mono">{st.hands}</td>
                    <td className="py-1 text-right font-mono">{st.hands ? pct(st.vpip) : '–'}</td>
                    <td className={`py-1 text-right font-mono ${rate >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {st.hands ? signed(rate, 0) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-white/40">SB và BB thường lỗ vì phải đặt blind: đó là bình thường.</p>
        </section>
      </div>
    </div>
  );
}
