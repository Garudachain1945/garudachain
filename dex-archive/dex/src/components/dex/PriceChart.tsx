import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api-config";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";

const RED   = "#CC0001";
const GREEN = "#22c55e";
const BORDER = "#e5e7eb";
const TEXT_DIM = "#6b7280";

// Candle interval = barSeconds (waktu per candle open→close)
// hours = range data yang ditampilkan
const CANDLE_INTERVALS = [
  { label: "1s",   key: "1s",   barMinutes: 1/60,   hours: 0.0833 },
  { label: "30s",  key: "30s",  barMinutes: 0.5,     hours: 0.5    },
  { label: "1m",   key: "1m",   barMinutes: 1,       hours: 1      },
  { label: "5m",   key: "5m",   barMinutes: 5,    hours: 4     },
  { label: "10m",  key: "10m",  barMinutes: 10,   hours: 8     },
  { label: "15m",  key: "15m",  barMinutes: 15,   hours: 12    },
  { label: "30m",  key: "30m",  barMinutes: 30,   hours: 24    },
  { label: "1h",   key: "1h",   barMinutes: 60,   hours: 72    },
  { label: "2h",   key: "2h",   barMinutes: 120,  hours: 168   },
  { label: "4h",   key: "4h",   barMinutes: 240,  hours: 336   },
  { label: "6h",   key: "6h",   barMinutes: 360,  hours: 504   },
  { label: "12h",  key: "12h",  barMinutes: 720,  hours: 720   },
  { label: "24h",  key: "24h",  barMinutes: 1440, hours: 1440  },
  { label: "1W",   key: "1W",   barMinutes: 10080, hours: 8760 },
  { label: "1M",   key: "1M",   barMinutes: 43200, hours: 26280 },
  { label: "1Y",   key: "1Y",   barMinutes: 525600, hours: 87600 },
  { label: "All",  key: "ALL",  barMinutes: 1440,  hours: 262800 },
];

interface PriceChartProps {
  symbol: string;
  assetId?: string;
  stock: {
    price: number;
    change: number;
    changePercent?: number;
    high24h?: number;
    low24h?: number;
    volume?: number;
  } | null;
}

export function PriceChart({ symbol, assetId, stock }: PriceChartProps) {
  const [activePeriod, setActivePeriod] = useState("1s");
  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number } | null>(null);
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [volumes, setVolumes] = useState<HistogramData[]>([]);
  const [dataSource, setDataSource] = useState<"onchain" | "empty">("empty");
  const [candleCountdown, setCandleCountdown] = useState("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const candleSeriesRef   = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef      = useRef<ISeriesApi<"Histogram"> | null>(null);
  const hasInitialFit     = useRef(false);
  const countdownLineRef  = useRef<any>(null);
  const candlesRef        = useRef<CandlestickData[]>([]);
  const prevCandleCount   = useRef(0);
  const period = CANDLE_INTERVALS.find((p) => p.key === activePeriod) ?? CANDLE_INTERVALS[0];

  // Keep candlesRef in sync
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // Countdown display only (no candle manipulation)
  useEffect(() => {
    const barSeconds = Math.max(Math.round(period.barMinutes * 60), 1);
    let rafId: number;
    let lastDisplay = "";

    function tick() {
      const now = Date.now() / 1000;
      const currentBarStart = Math.floor(now / barSeconds) * barSeconds;
      const remaining = Math.max(0, currentBarStart + barSeconds - now);

      let display: string;
      if (barSeconds <= 60) display = remaining.toFixed(1);
      else if (barSeconds <= 3600) {
        display = `${Math.floor(remaining / 60)}:${Math.floor(remaining % 60).toString().padStart(2, "0")}`;
      } else {
        display = `${Math.floor(remaining / 3600)}:${Math.floor((remaining % 3600) / 60).toString().padStart(2, "0")}:${Math.floor(remaining % 60).toString().padStart(2, "0")}`;
      }

      if (display !== lastDisplay) {
        lastDisplay = display;
        setCandleCountdown(display);
      }

      // Price line
      const cur = candlesRef.current;
      if (candleSeriesRef.current && cur.length > 0) {
        const last = cur[cur.length - 1] as CandlestickData;
        const bull = last.close >= last.open;
        const suffix = barSeconds <= 60 ? "s" : "";
        if (countdownLineRef.current) {
          countdownLineRef.current.applyOptions({ price: last.close, color: bull ? GREEN : RED, title: `  ${display}${suffix}` });
        } else {
          countdownLineRef.current = candleSeriesRef.current.createPriceLine({
            price: last.close, color: bull ? GREEN : RED, lineWidth: 1, lineStyle: 2,
            axisLabelVisible: true, title: `  ${display}${suffix}`, lineVisible: true,
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (countdownLineRef.current && candleSeriesRef.current) {
        try { candleSeriesRef.current.removePriceLine(countdownLineRef.current); } catch {}
        countdownLineRef.current = null;
      }
    };
  }, [period.barMinutes]);

  // Helper: build candle array from price points
  const buildCandles = (allPrices: { timestamp: number; price: number }[], barSeconds: number) => {
    const candleMap = new Map<number, { o: number; h: number; l: number; c: number; count: number }>();

    for (const p of allPrices) {
      const barTime = Math.floor(p.timestamp / barSeconds) * barSeconds;
      if (!candleMap.has(barTime)) {
        candleMap.set(barTime, { o: p.price, h: p.price, l: p.price, c: p.price, count: 1 });
      } else {
        const bar = candleMap.get(barTime)!;
        bar.h = Math.max(bar.h, p.price);
        bar.l = Math.min(bar.l, p.price);
        bar.c = p.price;
        bar.count++;
      }
    }

    // Fill gaps to current time
    const sortedTimes = [...candleMap.keys()].sort();
    if (sortedTimes.length > 0) {
      const first = sortedTimes[0];
      const now = Math.floor(Date.now() / 1000);
      const currentBarStart = Math.floor(now / barSeconds) * barSeconds;
      const last = Math.max(sortedTimes[sortedTimes.length - 1], currentBarStart);
      let prevClose = candleMap.get(first)!.c;
      for (let t = first; t <= last; t += barSeconds) {
        if (!candleMap.has(t)) {
          candleMap.set(t, { o: prevClose, h: prevClose, l: prevClose, c: prevClose, count: 0 });
        } else {
          prevClose = candleMap.get(t)!.c;
        }
      }
    }

    const allTimes = [...candleMap.keys()].sort();
    const newCandles: CandlestickData[] = [];
    const newVolumes: HistogramData[] = [];
    // Offset UTC → WIB (UTC+7) — GarudaChain uses Indonesian time
    const tzOffsetSec = 7 * 3600;

    let prevClose = 0;
    for (const t of allTimes) {
      const bar = candleMap.get(t)!;
      const open = prevClose > 0 ? prevClose : bar.o;
      const close = bar.c;
      const high = Math.max(open, close, bar.h);
      const low = Math.min(open, close, bar.l);
      const localTime = (t + tzOffsetSec) as Time;
      newCandles.push({ time: localTime, open, high, low, close });
      newVolumes.push({
        time: localTime,
        value: bar.count > 0 ? bar.count * 10000 : 0,
        color: close >= open ? "rgba(34,197,94,0.30)" : "rgba(204,0,1,0.30)",
      });
      prevClose = close;
    }

    return { newCandles, newVolumes };
  };

  // Store all price ticks (trades + live ticks)
  const allPricesRef = useRef<{ timestamp: number; price: number }[]>([]);

  // 1) Fetch trade history ONCE on load / interval change
  useEffect(() => {
    if (!assetId) return;

    async function fetchHistory() {
      try {
        const [historyRes, tradesRes] = await Promise.all([
          fetch(apiUrl(`/api/dex/price-history/${assetId}`)).then(r => r.json()).catch(() => []),
          fetch(apiUrl(`/api/dex/trades/${assetId}`)).then(r => r.json()).catch(() => []),
        ]);

        const allPrices: { timestamp: number; price: number }[] = [];
        if (Array.isArray(historyRes)) {
          for (const h of historyRes) if (h.price > 0) allPrices.push(h);
        }
        if (Array.isArray(tradesRes)) {
          for (const t of tradesRes) {
            let tradePrice = t.price_grd || t.price_after || t.price || 0;
            if (tradePrice > 1000) tradePrice = tradePrice / 1e8;
            if (tradePrice > 0) {
              allPrices.push({ timestamp: t.timestamp, price: tradePrice });
            }
          }
        }
        allPrices.sort((a, b) => a.timestamp - b.timestamp);

        // Deduplicate by timestamp
        const seen = new Set<string>();
        const unique = allPrices.filter(p => {
          const key = `${p.timestamp}_${p.price}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (unique.length === 0 && stock && stock.price > 0) {
          const now = Math.floor(Date.now() / 1000);
          const barSec = Math.max(Math.round(period.barMinutes * 60), 1);
          const currentBarStart = Math.floor(now / barSec) * barSec;
          for (let i = 30; i >= 0; i--) {
            unique.push({ timestamp: currentBarStart - i * barSec, price: stock.price });
          }
        }

        allPricesRef.current = unique;

        if (unique.length === 0) {
          setCandles([]); setVolumes([]); setDataSource("empty"); return;
        }

        const barSeconds = Math.max(Math.round(period.barMinutes * 60), 1);
        const { newCandles, newVolumes } = buildCandles(unique, barSeconds);
        setCandles(newCandles);
        setVolumes(newVolumes);
        setDataSource(newCandles.length > 0 ? "onchain" : "empty");
      } catch {
        setCandles([]); setVolumes([]); setDataSource("empty");
      }
    }

    fetchHistory();
    // Re-fetch full history every 30s to pick up new trades
    const iv = setInterval(fetchHistory, 30000);
    return () => clearInterval(iv);
  }, [assetId, activePeriod]);

  // 2) Every 1 SECOND: fetch live price and update current candle — always advance
  useEffect(() => {
    if (!assetId) return;

    const barSeconds = Math.max(Math.round(period.barMinutes * 60), 1);
    let lastKnownPrice = stock?.price || 1;

    const iv = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/dex/live-price/${assetId}`)).then(r => r.json()).catch(() => null);
        if (res?.price > 0) lastKnownPrice = res.price;
      } catch { /* ignore */ }

      const now = Math.floor(Date.now() / 1000);

      // Always push a tick so candles keep advancing to the right
      allPricesRef.current.push({ timestamp: now, price: lastKnownPrice });

      // Prevent memory bloat — keep last 10000 ticks
      if (allPricesRef.current.length > 10000) {
        allPricesRef.current = allPricesRef.current.slice(-8000);
      }

      const { newCandles, newVolumes } = buildCandles(allPricesRef.current, barSeconds);

      if (newCandles.length > 0) {
        setCandles(newCandles);
        setVolumes(newVolumes);
        setDataSource("onchain");
      }
    }, 1000);

    return () => clearInterval(iv);
  }, [assetId, activePeriod]);

  // Create chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: TEXT_DIM,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.04)" },
        horzLines: { color: "rgba(0,0,0,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#9ca3af", width: 1, style: 2, labelBackgroundColor: "#6b7280" },
        horzLine: { color: "#9ca3af", width: 1, style: 2, labelBackgroundColor: "#6b7280" },
      },
      rightPriceScale: {
        borderColor: BORDER,
        textColor: TEXT_DIM,
      },
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 5,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: {
        mouse: true,
        touch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         GREEN,
      downColor:       RED,
      borderUpColor:   GREEN,
      borderDownColor: RED,
      wickUpColor:     GREEN,
      wickDownColor:   RED,
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      },
    });

    chart.subscribeCrosshairMove((param) => {
      if (param.seriesData && candleSeries) {
        const bar = param.seriesData.get(candleSeries) as CandlestickData | undefined;
        setOhlc(bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close } : null);
      }
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current       = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current   = volSeries;

    // Keyboard zoom: +/= to zoom in, -/_ to zoom out
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!chartRef.current) return;
      const ts = chartRef.current.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const barsCount = range.to - range.from;

      if (e.key === "+" || e.key === "=") {
        // Zoom in — show fewer bars
        const newCount = Math.max(barsCount * 0.7, 5);
        const center = (range.from + range.to) / 2;
        ts.setVisibleLogicalRange({ from: center - newCount / 2, to: center + newCount / 2 });
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        // Zoom out — show more bars
        const newCount = barsCount * 1.4;
        const center = (range.from + range.to) / 2;
        ts.setVisibleLogicalRange({ from: center - newCount / 2, to: center + newCount / 2 });
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width:  chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, []);

  // Reset flags when interval or asset changes
  useEffect(() => {
    hasInitialFit.current = false;
    prevCandleCount.current = 0;
    candlesRef.current = [];
  }, [activePeriod, assetId]);

  // Update chart data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volSeriesRef.current || candles.length === 0) return;

    if (!hasInitialFit.current) {
      // First load: setData + fitContent
      candleSeriesRef.current.setData(candles);
      volSeriesRef.current.setData(volumes);
      chartRef.current?.timeScale().fitContent();
      hasInitialFit.current = true;
      prevCandleCount.current = candles.length;
      return;
    }

    const prevCount = prevCandleCount.current;
    const newCount = candles.length;

    if (newCount > prevCount) {
      // New candle(s) appeared — update all new candles individually
      for (let i = Math.max(prevCount - 1, 0); i < newCount; i++) {
        candleSeriesRef.current.update(candles[i]);
        volSeriesRef.current.update(volumes[i]);
      }
    } else {
      // Same candle count: just update the last candle (price tick within same bar)
      candleSeriesRef.current.update(candles[candles.length - 1]);
      volSeriesRef.current.update(volumes[volumes.length - 1]);
    }

    prevCandleCount.current = newCount;
  }, [candles, volumes]);

  const fmt = (v: number) => {
    if (v < 1) return v.toFixed(8) + " GRD";
    if (v < 100) return v.toFixed(4) + " GRD";
    return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " GRD";
  };

  const isPositive = (stock?.changePercent ?? 0) >= 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0 border-b border-border bg-gray-50/50">
        <div className="flex items-center gap-5 text-xs overflow-x-auto">
          <span className="font-bold font-mono text-base text-foreground">{fmt(stock?.price ?? 0)}</span>
          <div>
            <div className="text-[10px] text-muted-foreground">Perubahan 24J</div>
            <div className="font-mono font-bold" style={{ color: isPositive ? "#22c55e" : "#CC0001" }}>
              {isPositive ? "+" : ""}{(stock?.changePercent ?? 0).toFixed(2)}%
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] text-muted-foreground">Tertinggi 24J</div>
            <div className="font-mono font-bold text-foreground">{fmt(stock?.high24h ?? 0)}</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] text-muted-foreground">Terendah 24J</div>
            <div className="font-mono font-bold text-foreground">{fmt(stock?.low24h ?? 0)}</div>
          </div>
          <div className="hidden md:block">
            <div className="text-[10px] text-muted-foreground">Volume 24J</div>
            <div className="font-mono font-bold text-foreground">{fmt(stock?.volume ?? 0)}</div>
          </div>
          {dataSource === "onchain" && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-emerald-600">On-Chain Live</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 overflow-x-auto max-w-[50%] scrollbar-hide">
          {CANDLE_INTERVALS.map((p) => {
            const active = activePeriod === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setActivePeriod(p.key)}
                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-all whitespace-nowrap ${
                  active ? "text-[#8B0000] bg-red-50 border border-[#8B0000]/20" : "text-muted-foreground hover:text-foreground hover:bg-gray-100"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OHLC overlay */}
      <div className="px-3 py-1 shrink-0 text-[11px] font-mono flex items-center gap-3 bg-white border-b border-border/50">
        <span className="text-muted-foreground font-semibold">{symbol} · {period.label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-muted-foreground font-semibold tabular-nums">{candleCountdown}{period.barMinutes <= 1 ? "s" : ""}</span>
        {ohlc ? (
          <>
            <span className="text-muted-foreground">O <span className="text-foreground font-semibold">{fmt(ohlc.o)}</span></span>
            <span className="text-muted-foreground">H <span style={{ color: GREEN }} className="font-semibold">{fmt(ohlc.h)}</span></span>
            <span className="text-muted-foreground">L <span style={{ color: RED }} className="font-semibold">{fmt(ohlc.l)}</span></span>
            <span className="text-muted-foreground">C <span className="text-foreground font-semibold">{fmt(ohlc.c)}</span></span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        <div ref={chartContainerRef} className="absolute inset-0" />
        {dataSource === "empty" && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="text-center text-muted-foreground">
              <div className="text-sm font-semibold mb-1">Menunggu data trading on-chain...</div>
              <div className="text-xs">Lakukan swap/trade untuk melihat pergerakan harga</div>
              {stock?.price ? (
                <div className="mt-2 font-mono text-[#8B0000] font-bold">{fmt(stock.price)}</div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
