import { el } from './dom.ts';
import { price as fmtPrice, usd } from './format.ts';
import { t } from './i18n.ts';
import { ratioFigure } from './panes/pane-table.ts';
import { BALANCED_RATIO } from './mirror.ts';
import { fitText } from './text-fit.ts';
import type { Palette } from './theme.ts';
import { simulationRows, validSimulationPrice, type SimulationLevels, type SimulationRow, type SimulationTarget } from './price-simulation.ts';

export interface SimulationRead {
  price: number;
  targets: readonly SimulationTarget[];
  levels: SimulationLevels;
  status: string;
}

/** The table follows the live price and held snapshots. An open panel samples at most four times a second. */
export class PriceSimulationPanel {
  readonly root = el('div', { class: 'price-simulation' });
  #read: SimulationRead | null = null;
  #at = -Infinity;
  #selected: string | null = null;
  #custom: number | null = null;
  #selection: SimulationRow | null = null;
  #status = el('p', { class: 'panel-note', textContent: t('Loading…') });
  #body = el('tbody');
  #nodes = new Map<string, { row: HTMLTableRowElement; button: HTMLButtonElement; cells: HTMLTableCellElement[] }>();

  constructor(changed: () => void) {
    const input = el('input', { type: 'number', step: 'any', min: '0', required: true, ariaLabel: t('Target price'), placeholder: t('Target price') });
    const form = el('form', { class: 'simulation-form' }, input, el('button', { type: 'submit', textContent: t('Apply') }));
    form.onsubmit = event => {
      event.preventDefault();
      if (!validSimulationPrice(input.valueAsNumber)) return;
      this.#custom = input.valueAsNumber;
      this.#selected = 'custom';
      this.#update();
      changed();
    };
    const reset = el('button', { type: 'button', textContent: t('Reset'), onclick: () => {
      input.value = '';
      this.#custom = this.#selected = null;
      this.#update();
      changed();
    } });
    form.append(reset);
    const head = el('tr', {},
      el('th', { scope: 'col', textContent: t('Level') }),
      el('th', { scope: 'col', textContent: t('Price') }),
      el('th', { scope: 'col', textContent: t('Liq USD') }),
      el('th', { scope: 'col', textContent: 'BTC' }),
      el('th', { scope: 'col', textContent: t('Stops') }),
      el('th', { scope: 'col', textContent: t('Take profits') }),
      el('th', { scope: 'col', textContent: t('Ratio'), tip: t('Liquidations here divided by liquidations the same distance away on the other side.') }));
    this.#body.onclick = event => {
      const row = event.target instanceof HTMLElement ? event.target.closest<HTMLTableRowElement>('tr[data-target]') : null;
      if (!row?.dataset.target) return;
      this.#selected = row.dataset.target;
      this.#update();
      changed();
    };
    this.root.append(form, this.#status, el('div', { class: 'simulation-scroll' }, el('table', { ariaLabel: t('If price gets here') }, el('thead', {}, head), this.#body)));
  }

  sync(read: () => SimulationRead): void {
    const now = performance.now();
    if (now - this.#at < 250) return;
    this.#at = now;
    const next = read(), old = this.#read;
    if (old && Object.is(old.price, next.price) && old.status === next.status && old.levels.liq === next.levels.liq && old.levels.stops === next.levels.stops
        && old.levels.takes === next.levels.takes && old.targets.length === next.targets.length
        && old.targets.every((target, i) => target.id === next.targets[i]!.id && target.name === next.targets[i]!.name && target.price === next.targets[i]!.price)) return;
    this.#read = next;
    this.#update();
  }

  get target(): number | null { return this.#selection?.price ?? null; }

  #update(): void {
    const read = this.#read;
    if (!read) return;
    this.#status.textContent = read.status;
    const rows = simulationRows(read.price, read.targets, this.#custom, read.levels);
    this.#selection = rows.find(row => row.id === this.#selected) ?? null;
    const money = (value: number | null): string => value === null ? '—' : `$${usd(value)}`;
    const keep = new Set(rows.map(row => row.id));
    for (const [id, node] of this.#nodes) if (!keep.has(id)) { node.row.remove(); this.#nodes.delete(id); }
    for (const [i, data] of rows.entries()) {
      let node = this.#nodes.get(data.id);
      if (!node) {
        const button = el('button', { type: 'button' });
        const cells = Array.from({ length: 6 }, () => el('td'));
        node = { row: el('tr', {}, el('th', { scope: 'row' }, button), ...cells), button, cells };
        node.row.dataset.target = data.id;
        this.#nodes.set(data.id, node);
      }
      const selected = data.id === this.#selection?.id, sign = data.move < 0 ? '−' : data.move > 0 ? '+' : '';
      const distance = `${sign}${Number(Math.abs(data.move).toFixed(2))}%`;
      const name = data.name ?? (data.id === 'custom' ? t('Target price') : '');
      const label = name ? `${name} · ${distance}` : distance;
      if (node.button.textContent !== label) node.button.textContent = label;
      node.button.setAttribute('aria-pressed', String(selected));
      node.row.classList.toggle('on', selected);
      const values = [fmtPrice(data.price), money(data.liq), data.btc === null ? '—' : data.btc === 0 ? '0' : fmtPrice(data.btc), money(data.stops),
        money(data.takes), data.ratio === null ? '—' : ratioFigure(data.ratio)];
      node.cells.forEach((cell, k) => { if (cell.textContent !== values[k]) cell.textContent = values[k]!; });
      const order = data.order ?? '', opposite = order === 'buy' ? 'sell' : order === 'sell' ? 'buy' : '';
      for (const k of [1, 2, 3]) node.cells[k]!.dataset.order = order;
      node.cells[4]!.dataset.order = opposite;
      node.cells[5]!.dataset.order = data.ratio === null ? '' : data.ratio > BALANCED_RATIO ? order : data.ratio < 1 / BALANCED_RATIO ? opposite : '';
      if (this.#body.children[i] !== node.row) this.#body.insertBefore(node.row, this.#body.children[i] ?? null);
    }
  }
}

/** A dashed projection from the live edge to the chosen price. Its value also reads at the edge when it is offscreen. */
export function paintSimulationTarget(ctx: CanvasRenderingContext2D, palette: Palette, width: number, height: number, edge: number, from: number, y: number, target: number): void {
  const off = y < 10 ? '↑ ' : y > height - 10 ? '↓ ' : '';
  const belowTools = Math.min(44, height / 3);
  const at = Math.max(off === '↑ ' ? belowTools : 10, Math.min(height - 10, y)), x = Math.max(4, Math.min(width - 18, edge));
  const labelY = Math.max(belowTools, at);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.strokeStyle = palette.ui; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x, from); ctx.lineTo(x, at); ctx.lineTo(width, at); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const label = fitText(text => ctx.measureText(text).width, `${off}${t('Target price')} ${fmtPrice(target)}`, width - 16);
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = palette.panel; ctx.fillRect(width - tw - 12, labelY - 8, tw + 10, 16);
  ctx.fillStyle = palette.ui; ctx.fillText(label, width - 7, labelY);
  ctx.restore();
}
