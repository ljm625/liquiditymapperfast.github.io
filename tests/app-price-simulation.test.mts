import test from 'node:test';
import assert from 'node:assert/strict';
import { type LiqStanding } from '../src/app/liq-levels.ts';
import { simulationRows, type SimulationLevels } from '../src/app/price-simulation.ts';

/** Two $10 bins next to 100, with a leading zero and the cumulative dollars for the two sides. */
function standing(down: number, up: number): LiqStanding {
  return { step: 10, k: Int32Array.of(9, 10), long: Float64Array.of(0, down, down), short: Float64Array.of(0, 0, up) };
}

const sample: SimulationLevels = { liq: standing(200, 400), stops: standing(80, 60), takes: standing(140, 20) };
const named = [{ id: 'rvwap:30', name: 'RVWAP 30D', price: 105 }, { id: 'level:1', name: 'Sunday low', price: 95 }];

test('the simulation includes only the side reached and prorates bins for all three snapshots', () => {
  const rows = simulationRows(100, named, 102.5, sample);
  const pick = (id: string) => rows.find(r => r.id === id);
  assert.deepEqual(pick('rvwap:30'), { ...named[0], move: 5, liq: 200, btc: 2, stops: 30, takes: 10, ratio: 2, order: 'buy' });
  assert.deepEqual(pick('level:1'), { ...named[1], move: -5, liq: 100, btc: 1, stops: 40, takes: 70, ratio: 0.5, order: 'sell' });
  assert.deepEqual(pick('custom'), { id: 'custom', price: 102.5, move: 2.5, liq: 100, btc: 1, stops: 15, takes: 5, ratio: 2, order: 'buy' });
  assert.deepEqual(rows.map(row => row.price), [110, 105, 105, 103, 102.5, 102, 101, 99, 98, 97, 95, 95, 90]);
});

test('a known zero, a missing snapshot and a one-sided ratio are distinct', () => {
  const levels = { liq: standing(0, 400), stops: null, takes: standing(0, 0) };
  const rows = simulationRows(100, [], 100, levels), up = rows[0]!, down = rows.at(-1)!, same = rows.find(row => row.id === 'custom')!;
  assert.deepEqual([up.liq, up.ratio, up.stops, up.takes], [400, Infinity, null, 0]);
  assert.deepEqual([down.liq, down.ratio], [0, 0]);
  assert.deepEqual([same.liq, same.takes, same.ratio, same.order], [0, 0, null, null]);
  assert.ok(simulationRows(100, [], null, { ...levels, liq: null }).every(r => r.liq === null && r.btc === null && r.ratio === null));
  assert.deepEqual(simulationRows(NaN, [], 102, levels), []);
});
