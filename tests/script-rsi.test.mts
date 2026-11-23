import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, runScript } from '../src/app/script/lang/engine.ts';
import { plotExtent, segmentOnMap } from '../src/app/script/paint.ts';
import { newestOf, type ScriptResult } from '../src/app/script/protocol.ts';
import { RSI_SOURCE } from '../src/app/script/rsi.ts';
import type { BarInputs } from '../src/app/script/inputs.ts';

const MINUTE = 60_000;
const CLOSES = [100, 102, 104, 110, 119, 115, 111, 114, 118, 121, 117];
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
  const rsi = plots(runScript('rsi', RSI_SOURCE, OPTIONS, inputs()))[0]!.fields.value!;
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
    const endpointValues = [[rsi[4], rsi[9]], [prices[4], prices[9]]];
    drawn.forEach((plot, j) => {
      assert.match(plot.title, bullish ? /^Bullish/ : /^Bearish/);
      const [value, endValue] = endpointValues[j]!;
      assert.deepEqual(plot.segments, [{ from: 4, to: 9, value, endValue, confirmed: 10 }]);
      assert.deepEqual(newestOf(plot, 10), [NaN], 'not yet confirmed when only the first 10 candles are shown');
      assert.deepEqual(newestOf(plot, 11), [value, endValue]);
      assert.deepEqual(plotExtent(plot, 6, 8), [Math.min(value!, endValue!), Math.max(value!, endValue!)], 'the segment crosses the view');
    });
  }
});

test('a forming confirmation candle, a rewind and a gap cannot show a divergence early', () => {
  const data = inputs();
  const runner = createRunner('rsi', RSI_SOURCE, OPTIONS);
  const count = (input: BarInputs): number => plots(runner.run(input)).filter(plot => plot.segments?.length).length;
  assert.equal(count({ ...data, forming: true }), 0);
  assert.equal(count(data), 2);
  assert.equal(runner.startedAt, 10, 'confirming the live candle reuses the closed candles');
  assert.equal(count({ ...inputs([...CLOSES, 114]), forming: true }), 2);
  assert.equal(count({ ...inputs([...CLOSES, 118]), forming: true }), 2, 'a later live update keeps the confirmed pair');
  assert.equal(runner.startedAt, 11);
  assert.equal(count(inputs(CLOSES.slice(0, -1))), 0, 'rewind to before confirmation');
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
