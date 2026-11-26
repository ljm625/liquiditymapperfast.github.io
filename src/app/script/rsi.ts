/**
 * Wilder RSI of the chart's closes. The oscillator alone determines swing candles. Compare consecutive confirmed RSI
 * highs or lows 5 to 60 candles apart, with price taken from the same candles. Both plots use those times. A gap resets
 * the RSI and the previous swings. The rightmost confirmation candle must be closed before either plot draws.
 */
export const RSI_SOURCE = `// Wilder RSI with regular bullish and bearish divergences.
period = option(type=number, default=14, min=2, max=100, step=1, label="RSI period")
swing = option(type=number, default=5, min=1, max=20, step=1, label="Swing (candles each side)")
showOnMap = option(type=checkbox, default=true, label="Show divergences on the map")

var len = Math.max(2, Math.min(100, Math.round(period)))
var span = Math.max(1, Math.min(20, Math.round(swing)))
stamp = time
close = $price.close
high = $price.high
low = $price.low
var valid = isFinite(close) && isFinite(high) && isFinite(low)
if (!valid || renderer.length == 1 || stamp - stamp[1] != renderer.timeframe) {
  streak = 0
  gainAvg = 0
  lossAvg = 0
  highIndex = -Infinity
  lowIndex = -Infinity
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

var peak = pivot_high(rsi, span, span), trough = pivot_low(rsi, span, span)
// All of the pivot window must have RSI readings from this uninterrupted run of candles.
if (!renderer.forming && streak > len + 2 * span) {
  var at = stamp[span], pivotIndex = renderer.length - span
  if (isFinite(peak)) {
    var price = high[span], distance = pivotIndex - highIndex
    if (distance >= 5 && distance <= 60 && peak < highRsi && price > highPrice) {
      segment(highRsi, highTime, peak, at, title="Bearish RSI divergence", color=theme.down, lineStyle=2, lineWidth=2, dots=true, priceScaleId=rsiAxis)
      segment(highPrice, highTime, price, at, title="Bearish RSI divergence", color=theme.down, lineStyle=2, lineWidth=2, dots=true, position=above, label="Bearish RSI divergence", onMap=true, visible=showOnMap)
    }
    highIndex = pivotIndex
    highTime = at
    highRsi = peak
    highPrice = price
  }
  if (isFinite(trough)) {
    var price = low[span], distance = pivotIndex - lowIndex
    if (distance >= 5 && distance <= 60 && trough > lowRsi && price < lowPrice) {
      segment(lowRsi, lowTime, trough, at, title="Bullish RSI divergence", color=theme.up, lineStyle=2, lineWidth=2, dots=true, priceScaleId=rsiAxis)
      segment(lowPrice, lowTime, price, at, title="Bullish RSI divergence", color=theme.up, lineStyle=2, lineWidth=2, dots=true, position=below, label="Bullish RSI divergence", onMap=true, visible=showOnMap)
    }
    lowIndex = pivotIndex
    lowTime = at
    lowRsi = trough
    lowPrice = price
  }
}
`;
