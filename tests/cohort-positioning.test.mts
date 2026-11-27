import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { COHORT_HOUR, COHORT_WINDOW, PNL_COHORTS, SIZE_COHORTS, cohortFamily, type CohortId } from '../src/shared/cohorts.ts';
import { CohortPositioning } from '../src/server/v2/cohorts.mts';

const HOUR = Date.UTC(2026, 10, 27, 5), MIN = 60_000;
const sample = (t: number, cohort: CohortId) => ({ t, cohort, coin: 'BTC', cohort_type: cohortFamily(cohort), long_notional: '150.25', short_notional: '49.75', long_traders: 1, short_traders: null });
const batch = (hour: number) => [...PNL_COHORTS, ...SIZE_COHORTS].map(id => sample(hour, id));

test('Hyperdash reads are shared across clients and extend the cached window with an hourly tail', async () => {
  let now = HOUR + 20 * MIN;
  const requests: URL[] = [];
  const get: typeof fetch = async (input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture');
    assert.equal(init?.redirect, 'error');
    const url = new URL(String(input));
    requests.push(url);
    return Response.json({ has_more: false, data: batch(requests.length === 1 ? HOUR : HOUR + COHORT_HOUR) });
  };
  const cache = new CohortPositioning('fixture', get, () => now);
  const [first, concurrent] = await Promise.all([cache.read(null), cache.read(null)]);
  assert.equal(requests.length, 1);
  assert.deepEqual(first, concurrent);
  const query = requests[0]!.searchParams;
  assert.equal(query.get('coin'), 'BTC');
  assert.equal(query.get('cohort_type'), 'all');
  assert.ok(Number(query.get('end_time')) - Number(query.get('start_time')) <= COHORT_WINDOW);
  assert.deepEqual(first?.samples[0], { id: 'extremely_profitable', hour: HOUR, longUsd: 150.25, shortUsd: 49.75, longWallets: 1, shortWallets: null });
  now += 10 * MIN;
  await cache.read(null);
  assert.equal(requests.length, 1);
  now += COHORT_HOUR;
  assert.deepEqual((await cache.read(HOUR + COHORT_HOUR))?.samples, [], 'the current answer remains available while refreshing');
  await setImmediate();
  assert.equal(requests[1]?.searchParams.get('start_time'), String(HOUR - 3 * COHORT_HOUR));
  assert.equal((await cache.read(HOUR + COHORT_HOUR))?.samples.length, SIZE_COHORTS.length + PNL_COHORTS.length);
  assert.equal((await cache.read(null))?.samples.length, 2 * (SIZE_COHORTS.length + PNL_COHORTS.length));
  cache.close();
  assert.equal(await cache.read(null), null);
});

test('rate limits and malformed responses leave the last good cohort snapshot available', async () => {
  let now = HOUR + 20 * MIN, calls = 0;
  const get: typeof fetch = async () => {
    calls++;
    if (calls === 2) return new Response(null, { status: 429, headers: { 'Retry-After': '900' } });
    return Response.json({ has_more: false, data: calls === 1 ? batch(HOUR) : [{ ...sample(HOUR + COHORT_HOUR, 'large'), short_notional: 'invalid' }] });
  };
  const cache = new CohortPositioning('fixture', get, () => now);
  const good = await cache.read(null);
  now += COHORT_HOUR;
  await cache.read(null);
  await setImmediate();
  now += 14 * MIN;
  assert.deepEqual(await cache.read(null), good);
  assert.equal(calls, 2);
  now += MIN;
  await cache.read(null);
  await setImmediate();
  assert.equal(calls, 3);
  assert.deepEqual(await cache.read(null), good);
  cache.close();
});
