/** The BTC chart's on-demand Hyperdash cohort table and the selected row's 30-day long share. */
import { COHORT_HOUR, PNL_COHORTS, SIZE_COHORTS } from '../../shared/cohorts.ts';
import { compactBar } from '../device.ts';
import { el } from '../dom.ts';
import { ago, clock, clockYear, usd } from '../format.ts';
import { language, t } from '../i18n.ts';
import { pixelRatio } from '../pixel-ratio.ts';
import { togglePanel } from '../ui.ts';
import { COHORT_DAY, cohortHistory, longShare, shareChange, type CohortHistory, type CohortKey } from './model.ts';
import type { CohortRead } from './source.ts';
import './panel.css';

const REFRESH_MS = 5 * 60_000, STALE_MS = 2 * COHORT_HOUR;
const limits: Record<CohortKey, string> = {
  extremely_profitable: '≥ $1M', very_profitable: '$100K – $1M', profitable: '$0 – $100K',
  unprofitable: '−$100K – $0', very_unprofitable: '−$1M – −$100K', rekt: '< −$1M',
  apex: '≥ $5M', whale: '$1M – $5M', large: '$100K – $1M', medium: '$10K – $100K', small: '< $10K', all: '',
};

function titles(): Record<CohortKey, string> {
  return {
    extremely_profitable: t('Extremely profitable'), very_profitable: t('Very profitable'), profitable: t('Profitable'),
    unprofitable: t('Unprofitable'), very_unprofitable: t('Very unprofitable'), rekt: t('Heavily loss-making'),
    apex: t('Apex'), whale: t('Whale'), large: t('Large'), medium: t('Medium'), small: t('Small'), all: t('All wallets'),
  };
}

function money(amount: number, signed = false): string {
  const sign = amount < 0 ? '−' : signed && amount > 0 ? '+' : '';
  return `${sign}$${usd(Math.abs(amount))}`;
}

const tone = (value: number | null): string => value === null || value === 0 ? '' : value > 0 ? 'buy' : 'sell';

class CohortPanel {
  readonly root = el('div', { class: 'cohort-panel' });
  #names = titles();
  #count = new Intl.NumberFormat(language());
  #percent = new Intl.NumberFormat(language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  #status = el('p', { class: 'panel-note cohort-status', role: 'status', textContent: t('Loading…') });
  #rows = new Map<CohortKey, { row: HTMLTableRowElement; button: HTMLButtonElement; cells: HTMLTableCellElement[] }>();
  #scroll = el('div', { class: 'cohort-scroll', tabIndex: 0, role: 'region', ariaLabel: t('Trader cohorts'), hidden: true });
  #detail = el('section', { class: 'cohort-detail', hidden: true });
  #heading = el('h4');
  #spark = el('canvas', { class: 'cohort-spark', role: 'img', ariaLabel: t('Long share over 30 days') });
  #axis = el('div', { class: 'cohort-axis' }, el('span'), el('span'));
  #facts = el('p', { class: 'cohort-facts' });
  #selected: CohortKey = 'extremely_profitable';
  #history: CohortHistory | null = null;
  #answer: CohortRead['samples'] | null = null;
  #points: { hour: number; share: number }[] = [];
  #resize = new ResizeObserver(() => this.#paint());

  constructor() {
    const headers = [t('Group'), t('Long'), t('Short'), t('Net'), t('Long share'), t('24h change (pp)'), t('Wallets')];
    const table = el('table', { ariaLabel: t('Trader cohorts') }, el('thead', {}, el('tr', {}, ...headers.map(textContent => el('th', { scope: 'col', textContent })))),
      this.#section(t('By all-time PnL'), PNL_COHORTS), this.#section(t('By account value'), [...SIZE_COHORTS, 'all']));
    this.#scroll.append(table);
    this.#detail.append(this.#heading, this.#spark, this.#axis, this.#facts);
    this.root.append(this.#status, this.#scroll, this.#detail);
    this.#resize.observe(this.#spark);
  }

  close(): void { this.#resize.disconnect(); }

  #section(name: string, ids: readonly CohortKey[]): HTMLTableSectionElement {
    const body = el('tbody', {}, el('tr', { class: 'cohort-section' }, el('th', { scope: 'rowgroup', colSpan: 7, textContent: name })));
    for (const id of ids) {
      const select = (): void => {
        this.#selected = id;
        this.#select();
        if (compactBar()) this.#detail.scrollIntoView({ block: 'nearest' });
      };
      const button = el('button', { type: 'button', onclick: event => { event.stopPropagation(); select(); }, ariaPressed: 'false' },
        this.#names[id], ...(limits[id] ? [el('small', { textContent: limits[id] })] : []));
      const cells = Array.from({ length: 6 }, () => el('td'));
      const row = el('tr', { onclick: select }, el('th', { scope: 'row' }, button), ...cells);
      this.#rows.set(id, { row, button, cells });
      body.append(row);
    }
    return body;
  }

  show(read: CohortRead): void {
    if (this.#answer !== read.samples) {
      this.#answer = read.samples;
      this.#history = cohortHistory(read.samples);
      this.#renderTable();
      this.#select();
    }
    const history = this.#history;
    this.#scroll.hidden = this.#detail.hidden = history === null;
    if (!history) {
      this.#status.textContent = read.status === 'unconfigured' ? t('No trader cohort data source is configured.')
        : read.status === 'failed' ? t('Trader cohort data could not be loaded.') : t('No trader cohort snapshot is available yet.');
      return;
    }
    const age = Math.max(0, Date.now() - history.hour);
    const status = [t('Hyperdash'), 'BTC', clockYear(history.hour), ago(age)];
    if (age >= STALE_MS || read.status !== 'ready') status.push(t('Out of date'));
    this.#status.textContent = status.join(' · ');
  }

  #share(value: number | null): string { return value === null ? '—' : `${this.#percent.format(value)}%`; }
  #change(value: number | null): string {
    if (value === null) return '—';
    const rounded = Math.round(value * 10) / 10;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${sign}${this.#percent.format(Math.abs(rounded))}`;
  }

  #renderTable(): void {
    const h = this.#history;
    if (!h) return;
    for (const [key, { cells }] of this.#rows) {
      const sample = h.series.get(key)?.get(h.hour), net = sample ? sample.longUsd - sample.shortUsd : null;
      const long = sample && sample.longWallets !== null ? this.#count.format(sample.longWallets) : '—';
      const short = sample && sample.shortWallets !== null ? this.#count.format(sample.shortWallets) : '—';
      const change = shareChange(h, key, COHORT_DAY).change;
      const values = [sample ? money(sample.longUsd) : '—', sample ? money(sample.shortUsd) : '—', net === null ? '—' : money(net, true),
        this.#share(longShare(sample)), this.#change(change), `${long} / ${short}`];
      cells.forEach((cell, i) => { cell.textContent = values[i]!; });
      cells[0]!.dataset.order = sample?.longUsd ? 'buy' : '';
      cells[1]!.dataset.order = sample?.shortUsd ? 'sell' : '';
      cells[2]!.dataset.order = tone(net);
      cells[4]!.dataset.order = tone(change);
    }
  }

  #select(): void {
    const h = this.#history;
    if (!h) return;
    for (const [key, { row, button }] of this.#rows) {
      row.classList.toggle('on', key === this.#selected);
      button.setAttribute('aria-pressed', String(key === this.#selected));
    }
    const title = t('Long share over 30 days');
    this.#heading.textContent = `${this.#names[this.#selected]} · ${title}`;
    this.#spark.setAttribute('aria-label', this.#heading.textContent);
    this.#axis.firstElementChild!.textContent = clock(h.start, true);
    this.#axis.lastElementChild!.textContent = clock(h.hour, true);
    const points: { hour: number; share: number }[] = [];
    for (const [hour, sample] of h.series.get(this.#selected) ?? []) {
      const share = longShare(sample);
      if (share !== null) points.push({ hour, share });
    }
    this.#points = points;
    this.#spark.hidden = this.#axis.hidden = !points.length;
    const previousHour = shareChange(h, this.#selected, COHORT_HOUR).before, previousDay = shareChange(h, this.#selected, COHORT_DAY).before;
    const figures = points.map(p => p.share);
    this.#facts.textContent = points.length ? [t('Range {low}–{high}', { low: this.#share(Math.min(...figures)), high: this.#share(Math.max(...figures)) }),
      t('1 hour ago {share}', { share: this.#share(previousHour) }), t('24 hours ago {share}', { share: this.#share(previousDay) })].join(' · ')
      : t('No long-share history for this group.');
    this.#paint();
  }

  #paint(): void {
    const h = this.#history, canvas = this.#spark;
    if (!h || !this.#points.length || canvas.hidden) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (width < 10 || height < 10) return;
    const ratio = pixelRatio();
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    const figures = this.#points.map(p => p.share), lo = Math.min(...figures), hi = Math.max(...figures);
    const mid = (lo + hi) / 2, span = Math.max(hi - lo + 3, 6);
    const x = (hour: number): number => 4 + (width - 8) * (hour - h.start) / (h.hour - h.start);
    const y = (share: number): number => (height - 8) * (0.5 - (share - mid) / span) + 4;
    ctx.strokeStyle = ctx.fillStyle = getComputedStyle(canvas).color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let previous: number | null = null;
    for (const point of this.#points) {
      if (previous !== null && point.hour === previous + COHORT_HOUR) ctx.lineTo(x(point.hour), y(point.share));
      else ctx.moveTo(x(point.hour), y(point.share));
      previous = point.hour;
    }
    ctx.stroke();
    const last = this.#points.at(-1)!;
    this.#points.forEach((point, i) => {
      if (point === last || this.#points[i - 1]?.hour === point.hour - COHORT_HOUR || this.#points[i + 1]?.hour === point.hour + COHORT_HOUR) return;
      ctx.beginPath(); ctx.arc(x(point.hour), y(point.share), 1.5, 0, 2 * Math.PI); ctx.fill();
    });
    ctx.beginPath(); ctx.arc(x(last.hour), y(last.share), 2.5, 0, 2 * Math.PI); ctx.fill();
  }
}

/** Read while the panel is open and visible, with one request at a time. Closing the panel cancels its wait. */
export function toggleCohorts(anchor: HTMLElement, read: (signal: AbortSignal) => Promise<CohortRead>): void {
  const life = new AbortController();
  let view: CohortPanel | null = null, timer: number | undefined, busy = false;
  const opened = togglePanel(anchor, { title: t('Trader cohorts'), width: 740, align: 'right', stays: true, onClose: () => {
    life.abort(); window.clearInterval(timer); view?.close();
  } }, (_tools, body) => { view = new CohortPanel(); body.append(view.root); });
  if (!opened) return;
  const refresh = async (): Promise<void> => {
    if (busy || document.hidden || life.signal.aborted) return;
    busy = true;
    try {
      const answer = await read(life.signal);
      if (life.signal.aborted) return;
      view?.show(answer);
      if (answer.status === 'unconfigured') window.clearInterval(timer);
      opened.reposition();
    } finally { busy = false; }
  };
  timer = window.setInterval(() => { void refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); }, { signal: life.signal });
  void refresh();
}
