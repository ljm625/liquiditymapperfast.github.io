/** Leledc runs independently on these candle sizes. Settings are shared by the map and saved layouts. */
export const EXHAUSTION_FRAMES = ['1h', '4h', '1d'] as const;
export type ExhaustionFrame = typeof EXHAUSTION_FRAMES[number];
export const EXHAUSTION_MS: Readonly<Record<ExhaustionFrame, number>> = { '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const DAY = EXHAUSTION_MS['1d'];

/** Bounded history of one timeframe, at most 4,800 bars or 400 days, whichever is shorter. */
export const exhaustionBack = (tf: ExhaustionFrame): number => Math.min(4_800 * EXHAUSTION_MS[tf], 400 * DAY);

export interface ExhaustionSettings {
  on: boolean; frames: readonly ExhaustionFrame[];
  marks: boolean; levels: boolean;
  length: number; bars: number; thickness: number;
}

export const EXHAUSTION_LIMITS = { length: [1, 400], bars: [0, 400], thickness: [1, 5] } as const;
const DEFAULTS: Readonly<ExhaustionSettings> = { on: false, frames: EXHAUSTION_FRAMES, marks: true, levels: true, length: 40, bars: 10, thickness: 2 };

export function readExhaustion(raw: unknown): ExhaustionSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ExhaustionSettings, unknown>>;
  const flag = (key: 'on' | 'marks' | 'levels'): boolean => typeof value[key] === 'boolean' ? value[key] : DEFAULTS[key];
  const integer = (key: keyof typeof EXHAUSTION_LIMITS): number => {
    const [min, max] = EXHAUSTION_LIMITS[key], input = value[key];
    return typeof input === 'number' && Number.isInteger(input) && input >= min && input <= max ? input : DEFAULTS[key];
  };
  const frames = Array.isArray(value.frames) ? value.frames as unknown[] : EXHAUSTION_FRAMES;
  return { on: flag('on'), frames: EXHAUSTION_FRAMES.filter(tf => frames.includes(tf)), marks: flag('marks'), levels: flag('levels'),
    length: integer('length'), bars: integer('bars'), thickness: integer('thickness') };
}
