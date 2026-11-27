import test from 'node:test';
import assert from 'node:assert/strict';
import { COHORT_HOUR, COHORT_WINDOW, SIZE_COHORTS, mergeCohortSamples, readCohortData, type CohortId, type CohortSample } from '../src/shared/cohorts.ts';
import { COHORT_DAY, cohortHistory, longShare, shareChange } from '../src/app/cohorts/model.ts';

const HOUR = Date.UTC(2026, 10, 27, 5);
const sample = (hour: number, id: CohortId, longUsd = 60, shortUsd = 40, longWallets: number | null = 3): CohortSample => ({ hour, id, longUsd, shortUsd, longWallets, shortWallets: 2 });

test('wire validation, overlap replacement and a bounded 30-day history', () => {
  const received = readCohortData({ v: 1, coin: 'BTC', samples: [sample(HOUR, 'apex', 90), sample(HOUR - COHORT_WINDOW, 'apex'), sample(HOUR - COHORT_HOUR, 'apex')] });
  assert.deepEqual(received?.samples.map(r => r.hour), [HOUR - COHORT_HOUR, HOUR]);
  const merged = mergeCohortSamples(received!.samples, [sample(HOUR, 'apex', 100)]);
  assert.deepEqual(merged.map(r => r.longUsd), [60, 100]);
  assert.equal(readCohortData({ v: 1, coin: 'ETH', samples: [] }), null);
  assert.equal(readCohortData({ v: 1, coin: 'BTC', samples: [{ ...sample(HOUR, 'apex'), longUsd: '60' }] }), null);
  assert.equal(readCohortData({ v: 1, coin: 'BTC', samples: [sample(HOUR + 1, 'apex')] }), null);
});

test('cohort comparisons share one snapshot and require an exact prior hour', () => {
  const samples = [sample(HOUR - COHORT_DAY, 'profitable', 40, 60), sample(HOUR - 2 * COHORT_HOUR, 'profitable'),
    ...SIZE_COHORTS.map(id => sample(HOUR, id, 60, 40, id === 'small' ? null : 3)), sample(HOUR, 'profitable'), sample(HOUR, 'unprofitable', 0, 0),
    sample(HOUR + COHORT_HOUR, 'profitable', 95, 5)];
  const h = cohortHistory(samples)!;
  assert.equal(h.hour, HOUR);
  assert.deepEqual(shareChange(h, 'profitable', COHORT_DAY), { before: 40, change: 20 });
  assert.deepEqual(shareChange(h, 'profitable', COHORT_HOUR), { before: null, change: null });
  assert.equal(longShare(h.series.get('unprofitable')?.get(HOUR)), null);
  assert.deepEqual(h.series.get('all')?.get(HOUR), { hour: HOUR, longUsd: 300, shortUsd: 200, longWallets: null, shortWallets: 10 });
  const missing = cohortHistory(samples.filter(row => row.id !== 'small'))!;
  assert.equal(missing.series.get('all')?.get(HOUR), undefined);
});
