/**
 * The heat map's text as earlier versions of the page wrote it into a browser (`updateStarters`, starter.ts): one that still reads exactly
 * so is brought to the current version. Kept as written, never edited.
 */
export const PREVIOUS_HEATMAP_SOURCES: readonly string[] = [
  // 2026-10-27, master ede02cb to 9e10f5d: blue, a see-through grey and orange, in sRGB, the same on every theme.
  `// Stochastic heat map: the stochastic of the close (where it stands between the lowest low and the highest high of the
// last candles, 0 to 100) over sixteen windows, from 4 candles in the bottom row to 210 in the top one. Each row is a colour:
// warm near the top of its range, cool near the bottom. Rows that agree make a band of one colour; the line is their average.

scale = option(type=number, default=1, min=0.25, step=0.25, label="Window scale")
smooth = option(type=number, default=3, min=1, step=1, label="Smoothing (candles)")
lowColor = option(type=color, default="rgb(41,121,255)", label="Low")
midColor = option(type=color, default="rgba(128,128,128,0.12)", label="Middle")
highColor = option(type=color, default="rgb(255,152,0)", label="High")
lineColor = option(type=color, default="rgb(213,0,249)", label="Average")
showAverage = option(type=checkbox, default=true, label="Average line")
colorCandles = option(type=checkbox, default=false, label="Colour the candles")

// A function of your own: the colour of a reading from 0 to 100, from Low through Middle to High.
function shade(k) {
  return interpolate(k / 100, lowColor, midColor, highColor)
}

// One smoothed stochastic per window. Each call of stoch or ema keeps its own history, which is why there are sixteen lines
// and not a loop: in a loop every window would share one.
var c = $price.close
var h = $price.high
var l = $price.low
var k1 = ema(stoch(c, h, l, 4 * scale), smooth)
var k2 = ema(stoch(c, h, l, 5 * scale), smooth)
var k3 = ema(stoch(c, h, l, 7 * scale), smooth)
var k4 = ema(stoch(c, h, l, 9 * scale), smooth)
var k5 = ema(stoch(c, h, l, 12 * scale), smooth)
var k6 = ema(stoch(c, h, l, 15 * scale), smooth)
var k7 = ema(stoch(c, h, l, 20 * scale), smooth)
var k8 = ema(stoch(c, h, l, 26 * scale), smooth)
var k9 = ema(stoch(c, h, l, 34 * scale), smooth)
var k10 = ema(stoch(c, h, l, 44 * scale), smooth)
var k11 = ema(stoch(c, h, l, 57 * scale), smooth)
var k12 = ema(stoch(c, h, l, 74 * scale), smooth)
var k13 = ema(stoch(c, h, l, 96 * scale), smooth)
var k14 = ema(stoch(c, h, l, 125 * scale), smooth)
var k15 = ema(stoch(c, h, l, 162 * scale), smooth)
var k16 = ema(stoch(c, h, l, 210 * scale), smooth)

// The rows, on a scale of 0 to 100 (each 6.25 high), so the average line stands at its own value over them.
brokenarea({ time: time, lowerValue: 0, higherValue: 6.25, color: shade(k1) })
brokenarea({ time: time, lowerValue: 6.25, higherValue: 12.5, color: shade(k2) })
brokenarea({ time: time, lowerValue: 12.5, higherValue: 18.75, color: shade(k3) })
brokenarea({ time: time, lowerValue: 18.75, higherValue: 25, color: shade(k4) })
brokenarea({ time: time, lowerValue: 25, higherValue: 31.25, color: shade(k5) })
brokenarea({ time: time, lowerValue: 31.25, higherValue: 37.5, color: shade(k6) })
brokenarea({ time: time, lowerValue: 37.5, higherValue: 43.75, color: shade(k7) })
brokenarea({ time: time, lowerValue: 43.75, higherValue: 50, color: shade(k8) })
brokenarea({ time: time, lowerValue: 50, higherValue: 56.25, color: shade(k9) })
brokenarea({ time: time, lowerValue: 56.25, higherValue: 62.5, color: shade(k10) })
brokenarea({ time: time, lowerValue: 62.5, higherValue: 68.75, color: shade(k11) })
brokenarea({ time: time, lowerValue: 68.75, higherValue: 75, color: shade(k12) })
brokenarea({ time: time, lowerValue: 75, higherValue: 81.25, color: shade(k13) })
brokenarea({ time: time, lowerValue: 81.25, higherValue: 87.5, color: shade(k14) })
brokenarea({ time: time, lowerValue: 87.5, higherValue: 93.75, color: shade(k15) })
brokenarea({ time: time, lowerValue: 93.75, higherValue: 100, color: shade(k16) })

var average = (k1 + k2 + k3 + k4 + k5 + k6 + k7 + k8 + k9 + k10 + k11 + k12 + k13 + k14 + k15 + k16) / 16
if (showAverage) line(average, title="Average", color=lineColor, lineWidth=2)

// $price.color colours the map's candle: here by the average, when switched on.
if (colorCandles) $price.color = shade(average)
`,
];

/** The VWAP with bands as earlier versions wrote it into a browser (`updateStarters`): one that still reads exactly so is brought to the
 * current version. Kept as written, never edited. */
export const PREVIOUS_VWAP_SOURCES: readonly string[] = [
  // 2026-10-26 to 2026-10-28, master 249b08f to 3290195: weighted by the flow recorded on the page (vbuy + vsell), so a page that had not
  // recorded the last 48 candles (the public site, which reads the exchanges from the browser) drew nothing.
  `// VWAP with bands: the volume-weighted average of the typical price, (high + low + close) / 3, over the last candles.
// It rolls with the candles (it is not anchored to a session), and its bands are that price's deviation around it.

// option(...) is a setting: change it under the text, no need to edit the script.
len = option(type=number, default=48, min=4, step=1, label="Window (candles)")
mult = option(type=number, default=1.8, min=0.2, step=0.1, label="Band width (deviations)")
midColor = option(type=color, default="rgba(255,64,255,0.95)", label="VWAP")
bandColor = option(type=color, default="rgba(255,64,255,0.6)", label="Bands")

// A var is worked out again on every candle. vbuy and vsell are the dollars bought and sold at market in the candle.
var typical = ($price.high + $price.low + $price.close) / 3
var vol = vbuy + vsell
var num = sma(typical * vol, len)
var den = sma(vol, len)
var num2 = sma(typical * typical * vol, len)

// A name set without var keeps its value from candle to candle: mid[1] would be the VWAP one candle back.
// Where the flow was not recorded, vbuy reads NaN: with no volume to weigh by, the lines leave a gap there.
mid = den > 0 ? num / den : NaN
var sd = Math.sqrt(Math.max(0, num2 / den - mid * mid))
upper = mid + mult * sd
lower = mid - mult * sd

line(mid, title="VWAP", color=midColor, lineWidth=2)
line(upper, title="+SD", color=bandColor)
line(lower, title="-SD", color=bandColor)
`,
];

/**
 * The spot and perpetual CVD example as the page wrote it into a browser before its labels (2026-10-27 to 2026-11-11, `updateStarters`): a copy
 * that still reads exactly so becomes the labelled one. Kept as written, never edited.
 */
// Under a `source:` property, as the examples keep their scripts: a script's text is not a sentence of the page.
const PLAIN_CVD = { source: `// The cumulative delta of the spot markets and of the perpetuals, apart.
spotColor = option(type=color, default=#2e9bff, label=Spot)
perpColor = option(type=color, default=#ff9f1c, label=Perpetual)
spotDelta = source(vbuy, type=spot) - source(vsell, type=spot)
perpDelta = source(vbuy, type=perp) - source(vsell, type=perp)
line(cum(spotDelta), title=Spot, color=spotColor)
line(cum(perpDelta), title=Perp, color=perpColor, priceScaleId=perp)
` };
/**
 * The labelled one as the page wrote it into a browser from 2026-11-11 to 2026-11-18 (master edf8da37 to 0bb64d85): its labels plates at the
 * lines' newest candle, above and below them, where crossing lines put them over each other. Kept as written, never edited.
 */
const LABELLED_CVD = { source: `// Spot and perpetual CVD: the cumulative delta (what was bought at market less what was sold) of the spot markets and of
// the perpetuals, apart, each on a scale of its own. A label at each line's newest value says which it is, how far it has
// moved over the last candles (the lookback) and where it is heading: rising, falling or flat.
spotColor = option(type=color, default=#2e9bff, label=Spot)
perpColor = option(type=color, default=#ff9f1c, label=Perpetual)
trendLength = option(type=number, default=20, min=2, max=500, step=1, label="Lookback (candles)")
showLabels = option(type=checkbox, default=true, label="Labels")

spotDelta = source(vbuy, type=spot) - source(vsell, type=spot)
perpDelta = source(vbuy, type=perp) - source(vsell, type=perp)
spotCvd = cum(spotDelta)
perpCvd = cum(perpDelta)

// The move: how far each line has come over the lookback, which its label says. The path: how far it travelled candle
// by candle to get there. A line that went straight has a move as long as its path; one that went back and forth, a
// long path and a short move. A move under a quarter of its path counts as flat.
spotMove = spotCvd - last(spotCvd, trendLength + 1)
perpMove = perpCvd - last(perpCvd, trendLength + 1)
spotPath = sum(Math.abs(nz(spotDelta)), trendLength)
perpPath = sum(Math.abs(nz(perpDelta)), trendLength)

// Dollars, short: +$12.3M, -$850K.
function money(x) {
  var a = Math.abs(x), sign = x < 0 ? "-" : "+"
  if (a >= 1e12) return sign + "$" + (a / 1e12).toFixed(2) + "T"
  if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B"
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(1) + "M"
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(0) + "K"
  return sign + "$" + a.toFixed(0)
}
function trendOf(move, path) {
  if (!(path > 0) || Math.abs(move) < 0.25 * path) return "flat"
  return move > 0 ? "rising" : "falling"
}
function arrowOf(word) { return word == "rising" ? "▲" : word == "falling" ? "▼" : "▶" }
function tipOf(name, cvd, move, path, word) {
  var straight = path > 0 ? Math.round(100 * Math.abs(move) / path) : 0
  return name + " CVD over the last " + trendLength + " candles: " + money(move) + ", " + word + "\\nIt travelled " + money(path).slice(1) + " candle by candle, so the move is " + straight + " % straight (under 25 % counts as flat).\\nSince the first candle read: " + money(cvd)
}

line(spotCvd, title=Spot, color=spotColor)
line(perpCvd, title=Perp, color=perpColor, priceScaleId=perp)

// The labels stand on the newest candle only (renderer.last), under way or closed: a value that is not a number draws none.
var newest = showLabels && renderer.last
var spotWord = trendOf(spotMove, spotPath), perpWord = trendOf(perpMove, perpPath)
mark({value: newest ? spotCvd : NaN, text: "Spot " + money(spotMove) + " " + arrowOf(spotWord) + " " + spotWord, tip: tipOf("Spot", spotCvd, spotMove, spotPath, spotWord), color: spotColor}, title="Spot label", shape=label, position=above)
mark({value: newest ? perpCvd : NaN, text: "Perp " + money(perpMove) + " " + arrowOf(perpWord) + " " + perpWord, tip: tipOf("Perp", perpCvd, perpMove, perpPath, perpWord), color: perpColor}, title="Perp label", shape=label, position=below, priceScaleId=perp)
` };
export const PREVIOUS_CVD_SOURCES: readonly string[] = [PLAIN_CVD.source, LABELLED_CVD.source];

/** The original RSI example sampled the oscillator at each price pivot. Kept verbatim for saved copies. */
export const PREVIOUS_RSI_SOURCE = `// Wilder RSI with regular bullish and bearish divergences.
period = option(type=number, default=14, min=2, max=100, step=1, label="RSI period")
swing = option(type=number, default=3, min=1, max=20, step=1, label="Swing (candles each side)")
showOnMap = option(type=checkbox, default=true, label="Show divergences on the map")

var len = Math.max(2, Math.min(100, Math.round(period)))
var span = Math.max(1, Math.min(20, Math.round(swing)))
stamp = time
close = $price.close
var high = $price.high, low = $price.low
var valid = isFinite(close) && isFinite(high) && isFinite(low)
if (!valid || renderer.length == 1 || stamp - stamp[1] != renderer.timeframe) {
  streak = 0
  gainAvg = 0
  lossAvg = 0
  priorHigh = NaN
  priorLow = NaN
}
if (valid) streak += 1

// Seed with a simple average of the first len changes, then smooth by 1 / len.
if (streak > 1) {
  var change = close - close[1]
  var gain = Math.max(change, 0), loss = Math.max(-change, 0)
  if (streak <= len + 1) {
    gainAvg += gain / len
    lossAvg += loss / len
  } else {
    gainAvg += (gain - gainAvg) / len
    lossAvg += (loss - lossAvg) / len
  }
}
rsi = streak <= len ? NaN : gainAvg + lossAvg == 0 ? 50 : 100 * (gainAvg / (gainAvg + lossAvg))
line(rsi, title="RSI", color=theme.text, lineWidth=2, priceScaleId=rsiAxis)
line(70, title="70", color=interpolate(0.35, theme.background, theme.text), lineStyle=2, priceScaleId=rsiAxis)
line(30, title="30", color=interpolate(0.35, theme.background, theme.text), lineStyle=2, priceScaleId=rsiAxis)

var peak = pivot_high(high, span, span), trough = pivot_low(low, span, span)
var pivotRsi = rsi[span], pivotTime = stamp[span]
if (!renderer.forming && streak >= 2 * span + 1 && isFinite(pivotRsi)) {
  if (isFinite(peak)) {
    if (peak > priorHigh && pivotRsi < priorHighRsi) {
      segment(priorHighRsi, priorHighTime, pivotRsi, pivotTime, title="Bearish RSI divergence", color=theme.down, lineStyle=2, lineWidth=2, dots=true, priceScaleId=rsiAxis)
      segment(priorHigh, priorHighTime, peak, pivotTime, title="Bearish RSI divergence", color=theme.down, lineStyle=2, lineWidth=2, dots=true, position=above, label="Bearish RSI divergence", onMap=true, visible=showOnMap)
    }
    priorHigh = peak
    priorHighRsi = pivotRsi
    priorHighTime = pivotTime
  }
  if (isFinite(trough)) {
    if (trough < priorLow && pivotRsi > priorLowRsi) {
      segment(priorLowRsi, priorLowTime, pivotRsi, pivotTime, title="Bullish RSI divergence", color=theme.up, lineStyle=2, lineWidth=2, dots=true, priceScaleId=rsiAxis)
      segment(priorLow, priorLowTime, trough, pivotTime, title="Bullish RSI divergence", color=theme.up, lineStyle=2, lineWidth=2, dots=true, position=below, label="Bullish RSI divergence", onMap=true, visible=showOnMap)
    }
    priorLow = trough
    priorLowRsi = pivotRsi
    priorLowTime = pivotTime
  }
}
`;

/** The RSI example that matched separate price and RSI pivots. Kept verbatim for saved copies. */
export const PAIRED_RSI_SOURCE = `// Wilder RSI with regular bullish and bearish divergences.
period = option(type=number, default=14, min=2, max=100, step=1, label="RSI period")
swing = option(type=number, default=3, min=1, max=20, step=1, label="Swing (candles each side)")
showOnMap = option(type=checkbox, default=true, label="Show divergences on the map")

var len = Math.max(2, Math.min(100, Math.round(period)))
var span = Math.max(1, Math.min(20, Math.round(swing)))
stamp = time
close = $price.close
var high = $price.high, low = $price.low
var valid = isFinite(close) && isFinite(high) && isFinite(low)
if (!valid || renderer.length == 1 || stamp - stamp[1] != renderer.timeframe) {
  streak = 0
  gainAvg = 0
  lossAvg = 0
  priorHigh = NaN
  priorLow = NaN
  priorHighRsiTime = -Infinity
  priorLowRsiTime = -Infinity
}
if (valid) streak += 1

// Seed with a simple average of the first len changes, then smooth by 1 / len.
if (streak > 1) {
  var change = close - close[1]
  var gain = Math.max(change, 0), loss = Math.max(-change, 0)
  if (streak <= len + 1) {
    gainAvg += gain / len
    lossAvg += loss / len
  } else {
    gainAvg += (gain - gainAvg) / len
    lossAvg += (loss - lossAvg) / len
  }
}
rsi = streak <= len ? NaN : gainAvg + lossAvg == 0 ? 50 : 100 * (gainAvg / (gainAvg + lossAvg))
line(rsi, title="RSI", color=theme.text, lineWidth=2, priceScaleId=rsiAxis)
line(70, title="70", color=interpolate(0.35, theme.background, theme.text), lineStyle=2, priceScaleId=rsiAxis)
line(30, title="30", color=interpolate(0.35, theme.background, theme.text), lineStyle=2, priceScaleId=rsiAxis)

priceHigh = pivot_high(high, span, span)
priceLow = pivot_low(low, span, span)
var oscHigh = pivot_high(rsi, span, span), oscLow = pivot_low(rsi, span, span)
rsiHigh = streak > len + 2 * span ? oscHigh : NaN
rsiLow = streak > len + 2 * span ? oscLow : NaN

// Wait one more candle after the price pivot confirmation to consider both its neighbours. Prefer the same candle,
// then the earlier neighbour. Each RSI pivot is paired at most once and only in chronological order.
var priceBack = span + 1
function partnerBack(same, earlier, later, priorTime) {
  if (isFinite(same) && stamp[priceBack] > priorTime) return priceBack
  if (isFinite(earlier) && stamp[priceBack + 1] > priorTime) return priceBack + 1
  if (isFinite(later) && stamp[priceBack - 1] > priorTime) return priceBack - 1
  return NaN
}
if (!renderer.forming && streak > 2 * span + 1) {
  var peak = priceHigh[1], trough = priceLow[1], priceTime = stamp[priceBack]
  if (isFinite(peak)) {
    var rsiBack = partnerBack(rsiHigh[1], rsiHigh[2], rsiHigh, priorHighRsiTime)
    if (isFinite(rsiBack)) {
      var pivotRsi = rsi[rsiBack], rsiTime = stamp[rsiBack]
      if (peak > priorHigh && pivotRsi < priorHighRsi) {
        segment(priorHighRsi, priorHighRsiTime, pivotRsi, rsiTime, title="Bearish RSI divergence", color=theme.down, lineStyle=2, lineWidth=2, dots=true, priceScaleId=rsiAxis)
        segment(priorHigh, priorHighTime, peak, priceTime, title="Bearish RSI divergence", color=theme.down, lineStyle=2, lineWidth=2, dots=true, position=above, label="Bearish RSI divergence", onMap=true, visible=showOnMap)
      }
      priorHigh = peak
      priorHighTime = priceTime
      priorHighRsi = pivotRsi
      priorHighRsiTime = rsiTime
    } else {
      priorHigh = NaN
    }
  }
  if (isFinite(trough)) {
    var rsiBack = partnerBack(rsiLow[1], rsiLow[2], rsiLow, priorLowRsiTime)
    if (isFinite(rsiBack)) {
      var pivotRsi = rsi[rsiBack], rsiTime = stamp[rsiBack]
      if (trough < priorLow && pivotRsi > priorLowRsi) {
        segment(priorLowRsi, priorLowRsiTime, pivotRsi, rsiTime, title="Bullish RSI divergence", color=theme.up, lineStyle=2, lineWidth=2, dots=true, priceScaleId=rsiAxis)
        segment(priorLow, priorLowTime, trough, priceTime, title="Bullish RSI divergence", color=theme.up, lineStyle=2, lineWidth=2, dots=true, position=below, label="Bullish RSI divergence", onMap=true, visible=showOnMap)
      }
      priorLow = trough
      priorLowTime = priceTime
      priorLowRsi = pivotRsi
      priorLowRsiTime = rsiTime
    } else {
      priorLow = NaN
    }
  }
}
`;
