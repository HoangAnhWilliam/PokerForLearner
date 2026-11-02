# Poker Trainer

Webapp luyện Texas Hold'em (cash game 6-max) cho người mới.

## Cấu trúc

```
packages/poker-engine   Thư viện TypeScript thuần: bài, xếp hạng tay, outs, pot odds, equity
apps/web                Next.js 15 + Tailwind 4, dùng engine ở trên
```

## Chạy

```bash
npm install          # chạy ở thư mục gốc
npm test             # unit test cho engine
npm run dev          # mở http://localhost:3000
```

## Đã có

- Engine: đánh giá 5–7 lá (wheel, kicker, chia pot), outs theo loại tay, xác suất trúng chính xác,
  pot odds, EV, equity (tính chính xác hoặc Monte Carlo, đối thủ biết bài hoặc ngẫu nhiên)
- Trang `/calculator`: chọn bài, xem equity (chạy trong Web Worker), outs và quyết định call/fold
- Range: parser ký hiệu (`22+`, `ATs+`, `A5s-A2s`, `KQ`), 169 hand class, % range
- Chart 6-max 100bb (đơn giản cho người mới, không phải solver): mở bài UTG/HJ/CO/BTN/SB,
  BTN vs CO, BB vs BTN, BB vs UTG. Sửa chart trong `packages/poker-engine/src/preflop.ts`
- Trang `/preflop`: flashcard có sơ đồ bàn, phím tắt F/C/R/Space, câu sai được hỏi lại,
  thống kê lưu trong trình duyệt. Trang `/charts`: xem lưới 13x13 từng tình huống

- Engine: state machine một ván No-Limit Hold'em (blind, heads-up, min-raise, all-in thiếu,
  side pot, trả cược thừa, chia pot lẻ chip) + bot 4 phong cách (TAG, LAG, Station, Nit)
- Trang `/play`: bàn 6-max với 5 bot, slider và nút nhanh cho bet/raise, gợi ý khi tới lượt
  (chart preflop, equity, outs, pot odds), log ván, lời/lỗ theo bb

- Engine: parser hand history PokerStars (NLHE cash và tournament, ante, ghế trống, rake, uncalled bet),
  xuất ván của engine ra cùng định dạng, replay từng bước, phân tích theo người chơi
  (VPIP, PFR, 3-bet, WTSD, W$SD, AF, bb/100 theo vị trí, so chart preflop, equity lúc all-in) và danh sách leak
- Trang `/history`: ván chơi ở `/play` tự lưu trong trình duyệt (localStorage, tối đa 2000 ván), nhập thêm
  bằng dán văn bản hoặc file .txt, lọc ván (sai chart, all-in, thua/thắng lớn), xem lại ván trên bàn
  với phím ← →, tải về .txt

## Lộ trình

1. ~~Engine + máy tính~~
2. ~~Preflop trainer~~
3. ~~State machine một ván + side pot, bàn chơi với bot~~
4. ~~Nhập và phân tích hand history~~
5. Lộ trình học
