import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Poker Trainer',
  description: 'Luyện tập Texas Hold\'em: equity, outs, pot odds, preflop và hơn nữa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="antialiased">
        <header className="border-b border-white/10">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-sm">
            <Link href="/" className="font-display text-lg text-chip">
              ♠ Poker Trainer
            </Link>
            <Link href="/play" className="text-white/70 hover:text-white">
              Chơi
            </Link>
            <Link href="/preflop" className="text-white/70 hover:text-white">
              Preflop
            </Link>
            <Link href="/charts" className="text-white/70 hover:text-white">
              Chart
            </Link>
            <Link href="/calculator" className="text-white/70 hover:text-white">
              Máy tính
            </Link>
            <Link href="/history" className="text-white/70 hover:text-white">
              Lịch sử
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
