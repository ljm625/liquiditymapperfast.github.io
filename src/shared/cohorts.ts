/** Hourly Hyperdash BTC positioning shared by the server and the chart. The file holds aggregate rows only. */
export const COHORT_HOUR = 3_600_000;
export const COHORT_WINDOW = 30 * 24 * COHORT_HOUR;
export const COHORT_ROUTE = '/api/v2/cohorts';
const LAST_COHORT_HOUR = Date.UTC(2100, 0, 1);
export const PNL_COHORTS = ['extremely_profitable', 'very_profitable', 'profitable', 'unprofitable', 'very_unprofitable', 'rekt'] as const;
export const SIZE_COHORTS = ['apex', 'whale', 'large', 'medium', 'small'] as const;
export type CohortId = typeof PNL_COHORTS[number] | typeof SIZE_COHORTS[number];
const ids = new Set<string>([...PNL_COHORTS, ...SIZE_COHORTS]);
export const COHORT_COUNT = ids.size;
export const MAX_COHORT_SAMPLES = COHORT_COUNT * COHORT_WINDOW / COHORT_HOUR;

export interface CohortSample {
  hour: number; id: CohortId;
  longUsd: number; shortUsd: number;
  longWallets: number | null; shortWallets: number | null;
}

export interface CohortData { v: 1; coin: 'BTC'; samples: CohortSample[] }

export const cohortHour = (time: number): number => Math.floor(time / COHORT_HOUR) * COHORT_HOUR;
export const cohortId = (id: unknown): id is CohortId => typeof id === 'string' && ids.has(id);
export const cohortFamily = (id: CohortId): 'pnl' | 'size' => (PNL_COHORTS as readonly string[]).includes(id) ? 'pnl' : 'size';
export const isCohortHour = (hour: unknown): hour is number => typeof hour === 'number' && Number.isSafeInteger(hour) && hour > 0 && hour <= LAST_COHORT_HOUR && hour % COHORT_HOUR === 0;
export const cohortUsd = (usd: unknown): usd is number => typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 && usd <= Number.MAX_SAFE_INTEGER;
export const cohortWallets = (n: unknown): n is number | null => n === null || (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);

export function readCohortData(raw: unknown): CohortData | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, coin, samples } = raw as Record<string, unknown>;
  if (v !== 1 || coin !== 'BTC' || !Array.isArray(samples) || samples.length > MAX_COHORT_SAMPLES) return null;
  const rows: CohortSample[] = [];
  for (const row of samples as unknown[]) {
    if (!row || typeof row !== 'object') return null;
    const { hour, id, longUsd, shortUsd, longWallets, shortWallets } = row as Record<string, unknown>;
    if (!isCohortHour(hour) || !cohortId(id) || !cohortUsd(longUsd) || !cohortUsd(shortUsd) || !cohortWallets(longWallets) || !cohortWallets(shortWallets)) return null;
    rows.push({ hour, id, longUsd, shortUsd, longWallets, shortWallets });
  }
  return { v, coin, samples: mergeCohortSamples([], rows) };
}

/** Replace overlapping samples, keeping only 30 days relative to the newest sample. */
export function mergeCohortSamples(held: readonly CohortSample[], incoming: readonly CohortSample[]): CohortSample[] {
  let latest = 0;
  for (const rows of [held, incoming]) for (const row of rows) latest = Math.max(latest, row.hour);
  const kept = new Map<string, CohortSample>();
  for (const rows of [held, incoming]) for (const row of rows) {
    if (row.hour > latest - COHORT_WINDOW) kept.set(`${row.hour}/${row.id}`, row);
  }
  return [...kept.values()].sort((a, b) => a.hour - b.hour);
}

/** The latest hour with a reading for both families. Never compare a PnL table with a size table from a different hour. */
export function cohortSnapshotHour(sorted: readonly CohortSample[]): number | null {
  let hour = 0, family = '';
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i]!, next = cohortFamily(row.id);
    if (row.hour !== hour) { hour = row.hour; family = next; }
    else if (family !== next) return hour;
  }
  return null;
}
