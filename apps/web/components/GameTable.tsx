import { cardToString, evaluate, positionOf, potTotal, type HandState } from '@poker/engine';
import TableView from './TableView';
import { fmtBB, handNameVi, lastActionLabel } from '@/lib/format';

export interface SeatInfo {
  id: string;
  label: string;
  /** Style badge for bots, null for the human. */
  badge: string | null;
}

interface Props {
  hand: HandState;
  seats: SeatInfo[];
  /** Index of the human player; they sit at the bottom. */
  heroIndex: number;
}

export default function GameTable({ hand, seats, heroIndex }: Props) {
  const bb = hand.bb;
  const reveal = hand.complete && hand.showdown;
  const winners = new Set(hand.results?.flatMap((r) => r.winners) ?? []);
  const streetPot = hand.players.reduce((a, p) => a + p.bet, 0);
  const middlePot = potTotal(hand) - streetPot;

  return (
    <TableView
      bottomIndex={heroIndex}
      board={hand.board.map(cardToString)}
      pot={fmtBB(hand.complete ? potTotal(hand) : middlePot, bb)}
      seats={hand.players.map((p, i) => {
        const isHero = i === heroIndex;
        const showCards = isHero || (reveal && !p.folded);
        const rank = reveal && !p.folded ? evaluate([...p.hole, ...hand.board]) : null;
        return {
          key: p.id,
          name: seats[i]!.label,
          badge: seats[i]!.badge,
          position: positionOf(hand, i),
          stack: fmtBB(p.stack, bb),
          cards: p.folded && !isHero ? null : p.hole.map((c) => (showCards ? cardToString(c) : 'back')),
          big: isHero,
          folded: p.folded,
          active: hand.toAct === i,
          won: winners.has(p.id),
          isButton: i === hand.button,
          label: rank ? handNameVi(rank.name) : p.folded ? 'Fold' : lastActionLabel(hand.events, p.id, hand.street, bb),
          bet: p.bet > 0 && !hand.complete ? fmtBB(p.bet, bb) : null,
        };
      })}
    />
  );
}
