/** Hyperdash's billed API is called only while the BTC cohort panel is in use. One server-wide cache holds 30 days in RAM.
 * A refresh reads the missing hours and the last few hours again for late samples. Failed reads keep the last valid snapshot. */
import { COHORT_COUNT, COHORT_HOUR, COHORT_WINDOW, MAX_COHORT_SAMPLES, cohortFamily, cohortHour, cohortId, cohortSnapshotHour, cohortUsd, cohortWallets, isCohortHour, mergeCohortSamples, type CohortData, type CohortSample } from '../../shared/cohorts.ts';

const HYPERDASH_POSITIONING = 'https://data.hyperdash.com/v1/cohorts/positioning';
const RETRY_MS = 5 * 60_000;
const OVERLAP_MS = 3 * COHORT_HOUR;

function notional(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return cohortUsd(n) ? n : null;
}

/** Hyperdash returns USD as decimals and may omit wallet counts before its coverage began. */
function readPositioning(raw: unknown, from: number, to: number): CohortSample[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const { data, has_more } = raw as Record<string, unknown>;
  if (!Array.isArray(data) || data.length > MAX_COHORT_SAMPLES || has_more !== false) return null;
  const out: CohortSample[] = [];
  for (const row of data as unknown[]) {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    if (!isCohortHour(r.t) || r.coin !== 'BTC' || !cohortId(r.cohort) || r.cohort_type !== cohortFamily(r.cohort)) return null;
    const longUsd = notional(r.long_notional), shortUsd = notional(r.short_notional);
    const longWallets = r.long_traders ?? null, shortWallets = r.short_traders ?? null;
    if (longUsd === null || shortUsd === null || !cohortWallets(longWallets) || !cohortWallets(shortWallets)) return null;
    if (r.t >= from && r.t <= to) out.push({ hour: r.t, id: r.cohort, longUsd, shortUsd, longWallets, shortWallets });
  }
  return out;
}

export class CohortPositioning {
  #held: CohortSample[] = [];
  #latest: number | null = null;
  #next = 0;
  #pending: Promise<void> | null = null;
  #abort = new AbortController();

  constructor(private readonly key: string, private readonly get: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  async read(since: number | null): Promise<CohortData | null> {
    if (this.#abort.signal.aborted) return null;
    if (!this.#pending && this.now() >= this.#next) this.#pending = this.#refresh().finally(() => { this.#pending = null; });
    // The first reader waits for the result. Once populated, keep serving the snapshot while its hourly tail refreshes.
    if (this.#latest === null && this.#pending) await this.#pending;
    if (this.#latest === null || this.#abort.signal.aborted) return null;
    const samples = since === null ? this.#held : this.#held.filter(row => row.hour >= since);
    return { v: 1, coin: 'BTC', samples };
  }

  close(): void { this.#abort.abort(); }

  async #refresh(): Promise<void> {
    const now = this.now(), hour = cohortHour(now), floor = hour - COHORT_WINDOW + COHORT_HOUR;
    this.#next = now + RETRY_MS;
    const from = Math.max(floor, Math.min(hour, (this.#latest ?? floor) - OVERLAP_MS));
    const url = new URL(HYPERDASH_POSITIONING);
    url.search = new URLSearchParams({ coin: 'BTC', cohort_type: 'all', start_time: String(from), end_time: String(now) }).toString();
    try {
      const response = await this.get(url, { headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json' }, redirect: 'error',
        signal: AbortSignal.any([this.#abort.signal, AbortSignal.timeout(12_000)]) });
      if (!response.ok) {
        if (response.status === 429) {
          const retry = response.headers.get('retry-after');
          const ms = retry && /^\d+$/.test(retry) ? Number(retry) * 1_000 : retry ? Date.parse(retry) - now : 0;
          if (Number.isFinite(ms)) this.#next = now + Math.max(RETRY_MS, Math.min(24 * COHORT_HOUR, ms));
        }
        await response.body?.cancel();
        return;
      }
      const incoming = readPositioning(await response.json(), from, now);
      if (!incoming?.length || this.#abort.signal.aborted) return;
      const held = mergeCohortSamples(this.#held, incoming), latest = cohortSnapshotHour(held);
      if (latest === null) return;
      this.#held = held;
      this.#latest = latest;
      const complete = held.filter(row => row.hour === latest).length === COHORT_COUNT;
      if (latest >= hour && complete) this.#next = hour + COHORT_HOUR;
    } catch { /* A network or data failure keeps the cached answer until the next attempt. */ }
  }
}
