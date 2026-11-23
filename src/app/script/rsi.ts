/**
 * Wilder RSI of the chart's closes. Seed the averages with the first full set of changes and restart at gaps. Compare RSI at
 * consecutive price pivots of the same kind, after every candle to the right of the newer pivot closes. The same confirmed pair
 * is drawn on both scales, with an option to leave the markings on the RSI row alone.
 */
export const RSI_SOURCE = `// Wilder RSI with regular bullish and bearish divergences.
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
