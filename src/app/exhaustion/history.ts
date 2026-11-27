/** One paced candle history per signal timeframe. A view change never starts the counters over or asks a new window. */
import type { Fetcher } from '../../shared/history.ts';
import { KeyLevelHistory, type HistoryTarget } from '../keylevels/history.ts';
import { exhaustionLevels, exhaustionSignals, type ExhaustionLevel, type ExhaustionSignal } from './model.ts';
import { EXHAUSTION_MS, exhaustionBack, type ExhaustionFrame, type ExhaustionSettings } from './settings.ts';

const SETTLE_MS = 2_000;
const DAY = EXHAUSTION_MS['1d'];

export interface ExhaustionSeries { signals: readonly ExhaustionSignal[]; levels: readonly ExhaustionLevel[] }

export class ExhaustionHistory {
  #market = '';
  #histories = new Map<ExhaustionFrame, KeyLevelHistory>();
  #held = new Map<ExhaustionFrame, { key: string; data: ExhaustionSeries }>();

  constructor(private readonly get: Fetcher, private readonly now: () => number = Date.now) {}

  read(target: HistoryTarget, settings: ExhaustionSettings, canLoad: boolean, onLoad: () => void): ExhaustionSeries[] {
    if (this.#market !== target.id) {
      this.#market = target.id;
      this.#histories.clear();
      this.#held.clear();
    }
    const out: ExhaustionSeries[] = [], now = this.now();
    for (const tf of settings.frames) {
      const ms = EXHAUSTION_MS[tf], back = exhaustionBack(tf), from = Math.floor(now / DAY) * DAY - back;
      const closed = Math.floor((now - SETTLE_MS) / ms) * ms;
      let history = this.#histories.get(tf);
      if (!history) { history = new KeyLevelHistory(this.get, this.now, 5_000, back); this.#histories.set(tf, history); }
      if (canLoad && (history.id !== target.id || history.heldTo < closed + SETTLE_MS || history.reach(from) === 'coming')) history.ensure(target, from, ms, onLoad);
      // Wait for the walk back, so partial backfill does not restart the counts partway through the chart.
      if (history.id !== target.id || !history.bars.length || (history.knownFrom > from && !history.exhausted && !history.limited)) continue;
      const key = `${target.id}|${history.version}|${settings.length}|${settings.bars}`;
      let held = this.#held.get(tf);
      if (held?.key !== key) {
        const signals = exhaustionSignals(history.bars, tf, settings.length, settings.bars, history.heldTo - SETTLE_MS);
        held = { key, data: { signals, levels: exhaustionLevels(signals) } };
        this.#held.set(tf, held);
      }
      out.push(held.data);
    }
    return out;
  }
}
