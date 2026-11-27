import test from 'node:test';
import assert from 'node:assert/strict';
import { BTC } from '../src/shared/coins.ts';
import { ExhaustionHistory } from '../src/app/exhaustion/history.ts';
import { exhaustionCandle, exhaustionLevels, exhaustionSignals, type ExhaustionSignal } from '../src/app/exhaustion/model.ts';
import { exhaustionMarkers } from '../src/app/exhaustion/paint.ts';
import { EXHAUSTION_FRAMES, EXHAUSTION_MS, readExhaustion } from '../src/app/exhaustion/settings.ts';
import { historyTarget } from '../src/app/keylevels/history.ts';
import type { CandleRow } from '../src/app/store.ts';

const START = Date.UTC(2026, 10, 22), HOUR = EXHAUSTION_MS['1h'], DAY = EXHAUSTION_MS['1d'];
const candle = (at: number, close: number, open = close): CandleRow => [at, open, Math.max(close, open) + 1, Math.min(close, open) - 1, close, 1];

test('the original Leledc threshold is strict, the wick can tie, and a trigger waits for the source close', () => {
  const rows = Array.from({ length: 26 }, (_, i) => candle(START + i * HOUR, 50 + i, 50 + i + ([13, 14, 15, 25].includes(i) ? 1 : 0)));
  rows[13]![2] = rows[14]![2];
  const at = rows[14]![0] + HOUR;
  assert.deepEqual(exhaustionSignals(rows, '1h', 40, 10, at - 1), []);
  assert.deepEqual(exhaustionSignals(rows, '1h', 40, 10, at), [{ tf: '1h', at, side: 'resistance', price: rows[14]![2], count: 11 }]);
  assert.deepEqual(exhaustionSignals(rows, '1h', 40, 10, Infinity).map(r => [r.at, r.count]), [[at, 11], [rows[25]![0] + HOUR, 11]]);
  rows[12]![2] = 1_000;
  assert.deepEqual(exhaustionSignals(rows, '1h', 40, 10, at), []);
  assert.equal(exhaustionSignals(rows, '1h', 2, 10, at).length, 1);
});

test('the upward and downward counters persist independently through interruptions and reset only on their own trigger', () => {
  const rows = [10, 10, 10, 10, 11, 9, 12, 8].map((c, i) => candle(START + i * DAY, c, i === 6 ? c + 1 : i === 7 ? c - 1 : c));
  assert.deepEqual(exhaustionSignals(rows, '1d', 40, 1, Infinity), [
    { tf: '1d', at: START + 7 * DAY, side: 'resistance', price: 14, count: 2 },
    { tf: '1d', at: START + 8 * DAY, side: 'support', price: 6, count: 2 },
  ]);
});

test('close boundaries place a signal on the candle just ended across all chart intervals', () => {
  const signal: ExhaustionSignal = { tf: '4h', at: START + DAY, side: 'resistance', price: 60, count: 11 };
  for (const ms of [60_000, 300_000, 900_000, 1_800_000, HOUR, 4 * HOUR, DAY, 2 * DAY]) {
    const slot = Math.floor((signal.at - 1) / ms) * ms;
    const rows = [candle(slot, 55), candle(slot + ms, 56)];
    assert.equal(exhaustionCandle(rows, ms, signal), rows[0]);
  }
  assert.equal(exhaustionCandle([candle(signal.at, 55)], HOUR, signal), undefined);
  const rows = [candle(START, 55)], signals: ExhaustionSignal[] = [signal, { ...signal, tf: '1h', at: signal.at - HOUR }];
  const marks = exhaustionMarkers(signals.map(s => ({ signals: [s], levels: [] })), rows, DAY, START, START + DAY, signal.at);
  assert.equal(marks.length, 1);
  assert.deepEqual(marks[0]?.signals, signals);
  assert.deepEqual(exhaustionMarkers([{ signals: [signal], levels: [] }], rows, DAY, START, START + DAY, signal.at - 1), []);
});

test('levels stand until the next same-side signal from that timeframe and saved settings validate', () => {
  const high: ExhaustionSignal = { tf: '1h', at: START, side: 'resistance', price: 60, count: 11 };
  const other = { ...high, tf: '4h', at: START + HOUR } as const;
  const low = { ...high, side: 'support', price: 40, at: START + 2 * HOUR } as const;
  const next = { ...high, at: START + 4 * HOUR };
  assert.deepEqual(exhaustionLevels([high, other, low, next]).map(x => x.until), [next.at, Infinity, Infinity, Infinity]);
  assert.deepEqual(readExhaustion(undefined), { on: false, frames: EXHAUSTION_FRAMES, marks: true, levels: true, length: 40, bars: 10, thickness: 2 });
  assert.deepEqual(readExhaustion({ on: true, frames: ['4h', '4h', '1m'], length: '10', thickness: 0 }),
    { on: true, frames: ['4h'], marks: true, levels: true, length: 40, bars: 10, thickness: 2 });
});

test('the exchange history is lazy and refreshes its tail only after the source candle closes', async () => {
  const at = START + 15 * HOUR, target = historyTarget('binance:BTCUSDT', BTC)!;
  let now = at - 1_000, calls = 0;
  const rows = Array.from({ length: 15 }, (_, i) => candle(START + i * HOUR, 55 + i, 55 + i + (i === 14 ? 1 : 0)));
  const history = new ExhaustionHistory(async url => {
    assert.equal(new URL(url).searchParams.get('interval'), '1h');
    calls++;
    return calls === 1 ? rows : rows.slice(-3);
  }, () => now);
  const settings = readExhaustion({ on: true, frames: ['1h'] });
  assert.deepEqual(history.read(target, settings, false, () => {}), []);
  assert.equal(calls, 0);
  await new Promise<void>(resolve => { history.read(target, settings, true, resolve); });
  const first = history.read(target, settings, true, () => {})[0]!;
  assert.deepEqual(first.signals, []);
  now = at + 1_000;
  assert.equal(history.read(target, settings, true, () => {})[0], first);
  assert.equal(calls, 1);
  now = at + 6_000;
  await new Promise<void>(resolve => { history.read(target, settings, true, resolve); });
  assert.deepEqual(history.read(target, settings, true, () => {})[0]?.signals.map(s => s.at), [at]);
  assert.equal(calls, 2);
});
