import { onTheWay, type LiqStanding } from './liq-levels.ts';
import { levelsOrderSide, type OrderSide } from './order-side.ts';

/**
 * A single move from the live reference price to each target. Each series is the untriggered part of its own snapshot.
 * The liquidation ratio compares the target side with the same distance on the other side, in dollars.
 */
export interface SimulationTarget { id: string; price: number; name?: string }
export interface SimulationLevels { liq: LiqStanding | null; stops: LiqStanding | null; takes: LiqStanding | null }
export interface SimulationRow extends SimulationTarget {
  move: number;
  liq: number | null;
  btc: number | null;
  stops: number | null;
  takes: number | null;
  ratio: number | null;
  order: OrderSide | null;
}

const MOVES = [10, 5, 3, 2, 1, -1, -2, -3, -5, -10] as const;
const MAX_NAMED = 12;
export const validSimulationPrice = (price: number): boolean => Number.isFinite(price) && price > 0;

export function simulationRows(price: number, named: readonly SimulationTarget[], custom: number | null, levels: SimulationLevels): SimulationRow[] {
  if (!validSimulationPrice(price)) return [];
  const prices = new Set<number>();
  const near = named.filter(target => validSimulationPrice(target.price) && target.price !== price)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
    .filter(target => {
      if (prices.has(target.price)) return false;
      prices.add(target.price);
      return true;
    })
    .slice(0, MAX_NAMED);
  const targets: SimulationTarget[] = [...MOVES.map(move => ({ id: `move:${move}`, price: price * (100 + move) / 100 })), ...near];
  if (custom !== null && validSimulationPrice(custom)) targets.push({ id: 'custom', price: custom });
  return targets.sort((a, b) => b.price - a.price).map(target => {
    const at = target.price, distance = at - price, other = price - distance;
    const amount = (s: LiqStanding | null, to: number): number | null => s ? onTheWay(s, price, to)?.usd ?? 0 : null;
    const liq = amount(levels.liq, at), opposite = distance && validSimulationPrice(other) ? amount(levels.liq, other) : null;
    const ratio = liq === null || opposite === null || (liq === 0 && opposite === 0) ? null : opposite > 0 ? liq / opposite : Infinity;
    const order = distance === 0 ? null : levelsOrderSide('liq', distance > 0 ? 'short' : 'long');
    return { ...target, move: distance / price * 100, liq, btc: liq === null ? null : liq / price,
      stops: amount(levels.stops, at), takes: amount(levels.takes, at), ratio, order };
  });
}
