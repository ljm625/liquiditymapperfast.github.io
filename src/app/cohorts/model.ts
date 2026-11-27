/** The table and chart read the same hourly sample. Days and hours are compared at exact timestamps, so a gap does not become a change. */
import { COHORT_HOUR, COHORT_WINDOW, SIZE_COHORTS, cohortSnapshotHour, type CohortId, type CohortSample } from '../../shared/cohorts.ts';

export type CohortKey = CohortId | 'all';
type Positioning = Omit<CohortSample, 'id'>;
export const COHORT_DAY = 24 * COHORT_HOUR;

export function longShare(row: Positioning | undefined): number | null {
  if (!row) return null;
  const gross = row.longUsd + row.shortUsd;
  return gross > 0 ? 100 * row.longUsd / gross : null;
}

export interface CohortHistory {
  hour: number;
  start: number;
  series: ReadonlyMap<CohortKey, ReadonlyMap<number, Positioning>>;
}

export function cohortHistory(samples: readonly CohortSample[]): CohortHistory | null {
  const hour = cohortSnapshotHour(samples);
  if (hour === null) return null;
  const start = hour - COHORT_WINDOW + COHORT_HOUR;
  const series = new Map<CohortKey, Map<number, Positioning>>();
  for (const sample of samples) {
    if (sample.hour < start || sample.hour > hour) continue;
    const group = series.get(sample.id) ?? new Map<number, Positioning>();
    group.set(sample.hour, sample);
    series.set(sample.id, group);
  }
  const totals = new Map<number, Positioning>();
  for (const at of series.get('apex')?.keys() ?? []) {
    const rows = SIZE_COHORTS.map(id => series.get(id)?.get(at));
    if (rows.some(row => row === undefined)) continue;
    const total: Positioning = { hour: at, longUsd: 0, shortUsd: 0, longWallets: 0, shortWallets: 0 };
    for (const row of rows) {
      if (!row) continue;
      total.longUsd += row.longUsd;
      total.shortUsd += row.shortUsd;
      total.longWallets = total.longWallets === null || row.longWallets === null ? null : total.longWallets + row.longWallets;
      total.shortWallets = total.shortWallets === null || row.shortWallets === null ? null : total.shortWallets + row.shortWallets;
    }
    totals.set(at, total);
  }
  series.set('all', totals);
  return { hour, start, series };
}

export function shareChange(history: CohortHistory, key: CohortKey, interval: number): { before: number | null; change: number | null } {
  const group = history.series.get(key);
  const current = longShare(group?.get(history.hour)), before = longShare(group?.get(history.hour - interval));
  return { before, change: current === null || before === null ? null : current - before };
}
