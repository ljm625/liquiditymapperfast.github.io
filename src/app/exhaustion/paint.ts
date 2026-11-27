/** Marker hit boxes come from the paint pass, so moving the pointer never rescans the exchange candles. */
import { clock, price } from '../format.ts';
import { t } from '../i18n.ts';
import type { InfoLine } from '../infobox.ts';
import type { CandleRow } from '../store.ts';
import type { Palette } from '../theme.ts';
import type { View } from '../view.ts';
import type { ExhaustionSeries } from './history.ts';
import { exhaustionAtOrAfter, exhaustionCandle, type ExhaustionSignal } from './model.ts';
import type { ExhaustionSettings } from './settings.ts';

interface Marker { candle: CandleRow; side: ExhaustionSignal['side']; signals: ExhaustionSignal[] }
export interface ExhaustionHit { x: number; y: number; left: number; right: number; top: number; bottom: number; signals: readonly ExhaustionSignal[]; color: string }

/** Several source events can map to one displayed candle. Keep all of them in the same marker's card. */
export function exhaustionMarkers(series: readonly ExhaustionSeries[], candles: readonly CandleRow[], chartMs: number, from: number, to: number, now: number): Marker[] {
  const marks = new Map<string, Marker>();
  for (const { signals } of series) {
    for (let i = exhaustionAtOrAfter(signals, from - chartMs); i < signals.length; i++) {
      const signal = signals[i]!;
      if (signal.at > now || signal.at > to + chartMs) break;
      const candle = exhaustionCandle(candles, chartMs, signal);
      if (!candle || candle[0] >= to || candle[0] + chartMs <= from) continue;
      const key = `${candle[0]}|${signal.side}`, old = marks.get(key);
      if (old) old.signals.push(signal); else marks.set(key, { candle, side: signal.side, signals: [signal] });
    }
  }
  return [...marks.values()].sort((a, b) => a.candle[0] - b.candle[0]);
}

const DASH = { '1h': [2, 3], '4h': [6, 3], '1d': [] };
const ink = (side: ExhaustionSignal['side'], palette: Palette): string => side === 'support' ? palette.candleUp : palette.candleDown;

export function paintExhaustion(ctx: CanvasRenderingContext2D, series: readonly ExhaustionSeries[], f: {
  view: View; pw: number; ph: number; palette: Palette; now: number; settings: ExhaustionSettings;
  candles: readonly CandleRow[]; chartMs: number; candleShift: number; closeLine: boolean;
}): ExhaustionHit[] {
  const { view, pw, ph, palette, settings, now, chartMs } = f, hits: ExhaustionHit[] = [];
  if (!series.length || pw < 12 || ph < 18) return hits;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
  if (settings.levels) {
    ctx.lineWidth = settings.thickness; ctx.globalAlpha = 0.6;
    const right = Math.min(view.t1, now);
    for (const { levels } of series) for (const { signal, until } of levels) {
      if (signal.at > right) break;
      if (until <= view.t0) continue;
      const y = view.yOf(signal.price, ph);
      if (y < 0 || y > ph) continue;
      ctx.strokeStyle = ink(signal.side, palette); ctx.setLineDash(DASH[signal.tf]); ctx.beginPath();
      ctx.moveTo(view.xOf(Math.max(signal.at, view.t0), pw), y);
      ctx.lineTo(view.xOf(Math.min(until, right), pw), y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
  if (settings.marks) {
    const marks = exhaustionMarkers(series, f.candles, chartMs, view.t0, view.t1, now);
    ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const mark of marks) {
      const high = mark.side === 'resistance', dir = high ? -1 : 1;
      const x = view.xOf(mark.candle[0] + chartMs / 2, pw) + f.candleShift, wick = view.yOf(mark.candle[f.closeLine ? 4 : high ? 2 : 3], ph);
      if (x < 0 || x > pw || wick < 0 || wick > ph) continue;
      const y = Math.max(6, Math.min(ph - 6, wick + dir * 10)), color = ink(mark.side, palette);
      ctx.fillStyle = color; ctx.strokeStyle = palette.bg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - dir * 4); ctx.lineTo(x - 4.5, y + dir * 4); ctx.lineTo(x + 4.5, y + dir * 4); ctx.closePath(); ctx.stroke(); ctx.fill();
      const counts = new Map<ExhaustionSignal['tf'], number>();
      for (const signal of mark.signals) counts.set(signal.tf, (counts.get(signal.tf) ?? 0) + 1);
      const label = [...counts].map(([tf, count]) => count === 1 ? tf : `${tf} ×${count}`).join(' · '), labelY = y + dir * 11;
      const caption = labelY > 5 && labelY < ph - 5, half = caption ? Math.max(5, ctx.measureText(label).width / 2 + 2) : 5;
      if (caption) { ctx.lineWidth = 3; ctx.strokeText(label, x, labelY); ctx.fillText(label, x, labelY); }
      hits.push({ x, y, left: x - half, right: x + half, top: Math.min(y - 5, caption ? labelY - 5 : y), bottom: Math.max(y + 5, caption ? labelY + 5 : y), signals: mark.signals, color });
    }
  }
  ctx.restore();
  return hits;
}

export function exhaustionHit(hits: readonly ExhaustionHit[], x: number, y: number, touch: boolean): ExhaustionHit | null {
  const slop = touch ? 8 : 3;
  let found: ExhaustionHit | null = null, best = Infinity;
  for (const mark of hits) {
    if (x < mark.left - slop || x > mark.right + slop || y < mark.top - slop || y > mark.bottom + slop) continue;
    const d = Math.hypot(x - mark.x, y - mark.y);
    if (d < best) { best = d; found = mark; }
  }
  return found;
}

export function exhaustionLines(hit: ExhaustionHit, length: number): InfoLine[] {
  const high = hit.signals[0]?.side === 'resistance', lines: InfoLine[] = [{ text: high ? t('Exhaustion at a high') : t('Exhaustion at a low'), bold: true, color: high ? 'sell' : 'buy' }];
  const priceLabel = high ? t('Resistance') : t('Support'), signal = hit.signals[0];
  if (signal && hit.signals.length === 1) {
    lines.push({ label: signal.tf, text: clock(signal.at, true), rule: true },
      { text: high ? t('{count} closes above the close four candles earlier. The signal candle closed down at the highest high in {length} candles.', { count: signal.count, length })
        : t('{count} closes below the close four candles earlier. The signal candle closed up at the lowest low in {length} candles.', { count: signal.count, length }), wrap: true },
      { label: priceLabel, text: price(signal.price), bold: true });
  } else {
    for (const s of hit.signals.slice(0, 6)) lines.push({ label: s.tf, text: `${clock(s.at, true)} · ${priceLabel} ${price(s.price)}` });
  }
  lines.push({ text: t('Exhaustion levels (Leledc)'), color: 'muted', rule: true });
  return lines;
}
