/** Only the local server calls Hyperdash. Static builds may read a published copy of the aggregate JSON. */
import { COHORT_HOUR, COHORT_ROUTE, cohortSnapshotHour, mergeCohortSamples, readCohortData, type CohortSample } from '../../shared/cohorts.ts';

export type CohortStatus = 'ready' | 'empty' | 'unconfigured' | 'failed';
export interface CohortRead { status: CohortStatus; samples: readonly CohortSample[] }

export class CohortReader {
  #samples: CohortSample[] = [];
  #hour: number | null = null;
  readonly #url: URL | null = null;
  readonly #incremental: boolean;

  constructor(server: boolean, published: string | undefined, base: string) {
    this.#incremental = !published?.trim() && server;
    const address = this.#incremental ? COHORT_ROUTE : published?.trim();
    if (!address) return;
    try {
      const url = new URL(address, base);
      if (!url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === new URL(base).origin))) this.#url = url;
    } catch { /* An invalid address is treated as unconfigured. */ }
  }

  async read(signal: AbortSignal): Promise<CohortRead> {
    if (!this.#url) return { status: 'unconfigured', samples: this.#samples };
    const url = new URL(this.#url);
    if (this.#incremental && this.#hour !== null) url.searchParams.set('since', String(this.#hour - 3 * COHORT_HOUR));
    try {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), cache: 'no-cache', credentials: 'omit' });
      if (response.status === 404 && this.#incremental) return { status: 'unconfigured', samples: this.#samples };
      if (!response.ok) return { status: 'failed', samples: this.#samples };
      const data = readCohortData(await response.json());
      if (!data || signal.aborted) return { status: 'failed', samples: this.#samples };
      if (data.samples.length) {
        const samples = mergeCohortSamples(this.#samples, data.samples), hour = cohortSnapshotHour(samples);
        if (hour !== null) { this.#samples = samples; this.#hour = hour; }
      }
      return { status: this.#hour !== null ? 'ready' : 'empty', samples: this.#samples };
    } catch { return { status: 'failed', samples: this.#samples }; }
  }
}
