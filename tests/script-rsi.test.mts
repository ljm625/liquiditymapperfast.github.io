import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, runScript } from '../src/app/script/lang/engine.ts';
import { plotExtent, segmentOnMap } from '../src/app/script/paint.ts';
import { newestOf, type ScriptResult } from '../src/app/script/protocol.ts';
import { RSI_SOURCE } from '../src/app/script/rsi.ts';
import { PAIRED_RSI_SOURCE, PREVIOUS_RSI_SOURCE } from '../src/app/script/starter-previous.ts';
import { updateStarters } from '../src/app/script/starter.ts';
import type { BarInputs } from '../src/app/script/inputs.ts';
import { ROW_DEFAULT, SCRIPT_API, type ScriptRecord } from '../src/app/script/records.ts';

const MINUTE = 60_000;
const CLOSES = [100, 102, 99, 101, 110, 119, 115, 111, 114, 118, 121, 117, 116];
const OPTIONS = { period: 3, swing: 1 };

function inputs(prices = CLOSES): BarInputs {
  const close = Float64Array.from(prices);
  return {
    tf: MINUTE, time: close.map((_, i) => MINUTE * (i + 1)),
    open: close, close, high: close.map(c => c + 1), low: close.map(c => c - 1),
    volume: close.map(() => 1), sources: {}, forming: false,
  };
}

function plots(result: ScriptResult) {
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  return result.plots;
}

test('Wilder RSI seeds from a full period, then smooths gains and losses, with a neutral value for flat closes', () => {
  const data = inputs([100, 102, 104, 110, 119, 115]);
  const rsi = plots(runScript('rsi', RSI_SOURCE, OPTIONS, data))[0]!.fields.value!;
  assert.deepEqual([...rsi.slice(0, 5)], [NaN, NaN, NaN, 100, 100]);
  assert.ok(Math.abs(rsi[5]! - 100 * 94 / 130) < 1e-10);
  const flat = plots(runScript('rsi', RSI_SOURCE, OPTIONS, inputs([100, 100, 100, 100])));
  assert.equal(flat[0]!.fields.value![3], 50);
});

test('both kinds of divergence join the same confirmed candles in the row and on the price scale', () => {
  for (const bullish of [false, true]) {
    const data = inputs(bullish ? CLOSES.map(c => 250 - c) : CLOSES);
    const result = plots(runScript('rsi', RSI_SOURCE, OPTIONS, data));
    const drawn = result.filter(plot => plot.segments?.length);
    assert.deepEqual(drawn.map(segmentOnMap), [false, true]);
    const rsi = result[0]!.fields.value!, prices = bullish ? data.low : data.high;
    const endpointValues = [[rsi[5], rsi[10]], [prices[5], prices[10]]];
    drawn.forEach((plot, j) => {
      assert.match(plot.title, bullish ? /^Bullish/ : /^Bearish/);
      const [value, endValue] = endpointValues[j]!;
      assert.deepEqual(plot.segments, [{ from: 5, to: 10, value, endValue, confirmed: 11 }]);
      assert.deepEqual(newestOf(plot, 11), [NaN], 'wait for the candle after the RSI pivot to close');
      assert.deepEqual(newestOf(plot, 12), [value, endValue]);
      assert.deepEqual(plotExtent(plot, 6, 8), [Math.min(value!, endValue!), Math.max(value!, endValue!)], 'the segment crosses the view');
    });
  }
});

test('both plots stay on the RSI pivot candle when the price extreme is a candle away', () => {
  for (const [bullish, wickIndex] of [[true, 11], [false, 9]] as const) {
    const data = inputs(bullish ? CLOSES.map(c => 250 - c) : CLOSES);
    const prices = bullish ? data.low : data.high;
    prices[wickIndex] = bullish ? 124 : 126;
    const result = plots(runScript('rsi', RSI_SOURCE, OPTIONS, data));
    const row = result.find(plot => !segmentOnMap(plot) && plot.segments?.length)!;
    const map = result.find(plot => segmentOnMap(plot) && plot.segments?.length)!;
    const rsi = result[0]!.fields.value!;
    assert.match(row.title, bullish ? /^Bullish/ : /^Bearish/);
    assert.deepEqual(row.segments, [{ from: 5, to: 10, value: rsi[5], endValue: rsi[10], confirmed: 11 }]);
    assert.deepEqual(map.segments, [{ from: 5, to: 10, value: prices[5], endValue: prices[10], confirmed: 11 }]);
  }
});

test('a lower wick on a neighbouring candle cannot make the price compare lower at the RSI pivots', () => {
  const data = inputs([...CLOSES.map(c => 250 - c), 136]);
  data.low[5] = 125;
  data.low[11] = 124;
  const hasDivergence = (source: string): boolean => plots(runScript('rsi', source, OPTIONS, data)).some(plot => plot.segments?.length);
  assert.equal(hasDivergence(PAIRED_RSI_SOURCE), true, 'the old matching scheme drew this pair using the later wick');
  assert.equal(hasDivergence(RSI_SOURCE), false);
});

test('consecutive pivots must be 5 to 60 candles apart, including both limits', () => {
  for (const distance of [4, 5, 60, 61]) {
    const decline = Array.from({ length: distance - 2 }, (_, i) => 119 - 2 * (i + 1));
    const bottom = decline.at(-1)!;
    const data = inputs([...CLOSES.slice(0, 6), ...decline, bottom + 1, bottom + 2, bottom - 1]);
    data.high[5 + distance] = 130;
    const map = plots(runScript('rsi', RSI_SOURCE, OPTIONS, data)).find(plot => segmentOnMap(plot) && plot.title.startsWith('Bearish'))!;
    assert.deepEqual(map.segments, distance >= 5 && distance <= 60
      ? [{ from: 5, to: 5 + distance, value: 120, endValue: 130, confirmed: 6 + distance }]
      : [], `distance ${distance}`);
  }
});

test('a forming confirmation candle, a rewind and a gap cannot show a divergence early', () => {
  const data = inputs(CLOSES.slice(0, -1));
  const runner = createRunner('rsi', RSI_SOURCE, OPTIONS);
  const count = (input: BarInputs): number => plots(runner.run(input)).filter(plot => plot.segments?.length).length;
  assert.equal(count({ ...data, forming: true }), 0);
  assert.equal(count(data), 2);
  assert.equal(runner.startedAt, 11, 'confirming the live candle reuses the closed candles');
  assert.equal(count({ ...inputs(CLOSES), forming: true }), 2);
  assert.equal(count({ ...inputs([...CLOSES.slice(0, -1), 118]), forming: true }), 2, 'a later live update keeps the confirmed pair');
  assert.equal(runner.startedAt, 12);
  assert.equal(count(inputs(CLOSES.slice(0, -2))), 0, 'rewind to before confirmation');
  const gap = inputs();
  for (let i = 6; i < gap.time.length; i++) gap.time[i]! += MINUTE;
  assert.equal(count(gap), 0, 'no comparison across missing time');
  const hidden = plots(runScript('rsi', RSI_SOURCE, { ...OPTIONS, showOnMap: false }, data));
  assert.deepEqual(hidden.filter(segmentOnMap).map(plot => plot.style.visible), [false, false]);
  assert.ok(hidden.some(plot => !segmentOnMap(plot) && plot.segments?.length));
});

test('a segment point object can name both ends on earlier candles', () => {
  const source = 'stamp = time\nif (renderer.length == 4) segment({value: 100, from: stamp[3], endValue: 120, to: stamp[1]})';
  const [plot] = plots(runScript('segment', source, {}, inputs()));
  assert.deepEqual(plot?.segments, [{ from: 0, to: 2, value: 100, endValue: 120, confirmed: 3 }]);
});

test('saved RSI examples from both earlier versions keep their settings and placement', () => {
  for (const source of [PREVIOUS_RSI_SOURCE, PAIRED_RSI_SOURCE]) {
    const saved: ScriptRecord = { id: 'rsi-divergence--000123', source: source.replace(/\n/g, '\r\n'), name: 'BTC RSI',
      options: { period: 21, swing: 2, showOnMap: false }, api: SCRIPT_API, height: ROW_DEFAULT, place: 'pane', on: true };
    assert.deepEqual(updateStarters([saved]), [{ ...saved, source: RSI_SOURCE }]);
    const edited = { ...saved, source: saved.source + '// my notes\n' };
    assert.equal(updateStarters([edited])[0], edited);
  }
});
