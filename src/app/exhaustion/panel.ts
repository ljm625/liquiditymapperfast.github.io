import { currentCoin } from '../coin.ts';
import { t } from '../i18n.ts';
import { priceListing } from '../../shared/price-history.ts';
import type { Store } from '../store.ts';
import { heading, note, numberRow, switchRow } from '../ui.ts';
import { EXHAUSTION_FRAMES, EXHAUSTION_LIMITS, readExhaustion, type ExhaustionSettings } from './settings.ts';

export const exhaustionTitle = (): string => t('Exhaustion levels (Leledc)');

export function buildExhaustionPanel(store: Store, body: HTMLElement): void {
  const current = store.state.exhaustion;
  const set = (change: Partial<ExhaustionSettings>): void => store.set({ exhaustion: readExhaustion({ ...store.state.exhaustion, ...change }) });
  const number = (key: keyof typeof EXHAUSTION_LIMITS, label: string, desc: string): HTMLElement => {
    const [min, max] = EXHAUSTION_LIMITS[key];
    return numberRow(label, desc, { min, max, step: 1, value: current[key] }, value => set({ [key]: value }));
  };
  body.append(
    switchRow(t('Show Leledc'), t('Mark confirmed exhaustion signals on the chart.'), current.on, on => set({ on })),
    heading(t('Signal timeframes')),
    ...EXHAUSTION_FRAMES.map(tf => switchRow(tf, t('Detect signals from this candle timeframe.'), current.frames.includes(tf), checked => {
      const selected = store.state.exhaustion.frames;
      set({ frames: checked ? [...selected, tf] : selected.filter(frame => frame !== tf) });
    })),
    number('length', t('Swing length'), t('Number of candles checked for the highest high or lowest low.')),
    number('bars', t('Exhaustion count'), t('The number of qualifying closes must exceed this count.')),
    switchRow(t('Show arrows'), t('Label the chart candle at the close of each signal.'), current.marks, marks => set({ marks })),
    switchRow(t('Show support and resistance'), t('Extend each level until a new one on the same side and timeframe replaces it.'), current.levels, levels => set({ levels })),
    number('thickness', t('Line thickness'), t('Width of the support and resistance lines.')),
  );
  if (!priceListing(currentCoin(), store.state.seriesInstrument || store.state.marketId)) body.append(note(t('Candle history is unavailable for this market.')));
}
