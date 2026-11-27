import type { CandleRow } from '../store.ts';
import { candleHolding } from '../zoomed-candles.ts';
import { EXHAUSTION_MS, type ExhaustionFrame } from './settings.ts';

export interface ExhaustionSignal { tf: ExhaustionFrame; at: number; side: 'support' | 'resistance'; price: number; count: number }

/** The counters accumulate independently across bars. Only a trigger resets its own count. The swing includes the trigger candle. */
export function exhaustionSignals(rows: readonly CandleRow[], tf: ExhaustionFrame, length: number, bars: number, closedThrough: number): ExhaustionSignal[] {
  const ms = EXHAUSTION_MS[tf], out: ExhaustionSignal[] = [];
  let up = 0, down = 0;
  for (let i = 4; i < rows.length; i++) {
    const [start, open, high, low, close] = rows[i]!, at = start + ms;
    if (at > closedThrough) break;
    const prior = rows[i - 4]![4];
    if (close > prior) up++;
    if (close < prior) down++;
    const atHigh = up > bars && close < open, atLow = down > bars && close > open;
    if (!atHigh && !atLow) continue;
    let extreme = true;
    for (let j = Math.max(0, i + 1 - length); j < i; j++) {
      const c = rows[j]!;
      if (atHigh ? c[2] > high : c[3] < low) { extreme = false; break; }
    }
    if (!extreme) continue;
    if (atHigh) { out.push({ tf, at, side: 'resistance', price: high, count: up }); up = 0; }
    else { out.push({ tf, at, side: 'support', price: low, count: down }); down = 0; }
  }
  return out;
}

/** First signal ending at or after `at`, in one source timeframe's time order. */
export function exhaustionAtOrAfter(signals: readonly ExhaustionSignal[], at: number): number {
  let lo = 0, hi = signals.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (signals[mid]!.at < at) lo = mid + 1; else hi = mid; }
  return lo;
}

export function exhaustionCandle(rows: readonly CandleRow[], chartMs: number, signal: ExhaustionSignal): CandleRow | undefined {
  // At the exact boundary the next candle opens. The marker belongs to the candle whose last instant carried the confirmation.
  return candleHolding(rows, chartMs, signal.at - 1);
}

export interface ExhaustionLevel { signal: ExhaustionSignal; until: number }

/** Each side stands until a later signal of the same side and timeframe replaces it. */
export function exhaustionLevels(signals: readonly ExhaustionSignal[]): ExhaustionLevel[] {
  const next = new Map<string, number>(), levels: ExhaustionLevel[] = [];
  for (let i = signals.length - 1; i >= 0; i--) {
    const signal = signals[i]!;
    const key = `${signal.tf}|${signal.side}`;
    levels.push({ signal, until: next.get(key) ?? Infinity });
    next.set(key, signal.at);
  }
  return levels.reverse();
}
