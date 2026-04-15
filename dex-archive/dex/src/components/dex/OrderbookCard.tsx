import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api-config";

interface OrderbookEntry {
  price: number;
  quantity: number;
  total: number;
}

interface OrderbookData {
  asks: OrderbookEntry[];
  bids: OrderbookEntry[];
  lastPrice: number;
  spread: number;
}

function fmt(v: number, d = 0) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

function fmtPrice(v: number) {
  return v.toFixed(6);
}

function OrderRow({ entry, maxQty, side }: {
  entry: OrderbookEntry; maxQty: number; side: "bid" | "ask";
}) {
  const pct = maxQty > 0 ? Math.min((entry.quantity / maxQty) * 100, 100) : 0;
  const barColor = side === "ask"
    ? "rgba(234, 57, 67, 0.20)"
    : "rgba(22, 199, 132, 0.20)";
  const priceColor = side === "ask" ? "#ea3943" : "#16c784";

  return (
    <div
      className="grid grid-cols-3 relative select-none cursor-pointer"
      style={{ padding: "1.5px 8px" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        className="absolute top-0 right-0 bottom-0 pointer-events-none"
        style={{ width: `${pct}%`, background: barColor, transition: "width 0.3s ease" }}
      />
      <div className="relative z-10 font-mono text-[12px] font-semibold tabular-nums" style={{ color: priceColor }}>
        {fmtPrice(entry.price)}
      </div>
      <div className="relative z-10 text-right font-mono text-[12px] tabular-nums text-foreground">
        {fmt(entry.quantity, 0)}
      </div>
      <div className="relative z-10 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
        {fmt(entry.total, 2)}
      </div>
    </div>
  );
}

type ViewMode = "both" | "asks" | "bids";

export function OrderbookCard({ basePrice, assetId, refreshKey }: { symbol?: string; basePrice: number; assetId?: string; refreshKey?: number }) {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const spotPrice = basePrice;

  useEffect(() => {
    function fetchOrderbook() {
      if (!assetId) {
        setOrderbook({ asks: [], bids: [], lastPrice: spotPrice, spread: 0 });
        return;
      }
      fetch(apiUrl(`/api/blockchain/orderbook/${assetId}`))
        .then(r => r.json())
        .then(data => {
          const hasAsks = data.asks && data.asks.length > 0;
          const hasBids = data.bids && data.bids.length > 0;

          if (hasAsks || hasBids) {
            // Parse on-chain orderbook: price_grd in receh, convert to GRD
            const toGrd = (p: number) => p > 1000 ? p / 1e8 : p;
            let askTotal = 0;
            const asks = (data.asks || [])
              .filter((a: any) => (a.remaining || a.amount || 0) > 0)
              .map((a: any) => {
                const qty = a.remaining || a.quantity || a.amount || 0;
                const price = toGrd(a.price_grd || a.price || 0);
                askTotal += qty;
                return { price, quantity: qty, total: askTotal };
              })
              .sort((a: any, b: any) => a.price - b.price);
            let bidTotal = 0;
            const bids = (data.bids || [])
              .filter((b: any) => (b.remaining || b.amount || 0) > 0)
              .map((b: any) => {
                const qty = b.remaining || b.quantity || b.amount || 0;
                const price = toGrd(b.price_grd || b.price || 0);
                bidTotal += qty;
                return { price, quantity: qty, total: bidTotal };
              })
              .sort((a: any, b: any) => b.price - a.price);
            const lowestAsk = asks.length > 0 ? asks[0].price : 0;
            const highestBid = bids.length > 0 ? bids[0].price : 0;
            const spread = lowestAsk > 0 && highestBid > 0 ? lowestAsk - highestBid : 0;
            const lastPrice = highestBid > 0 ? highestBid : (lowestAsk > 0 ? lowestAsk : spotPrice);
            setOrderbook({ asks: asks.reverse(), bids, lastPrice, spread });
          } else {
            setOrderbook({ asks: [], bids: [], lastPrice: spotPrice, spread: 0 });
          }
        })
        .catch(() => {
          setOrderbook({ asks: [], bids: [], lastPrice: spotPrice, spread: 0 });
        });
    }

    fetchOrderbook();
    intervalRef.current = setInterval(fetchOrderbook, 5000);
    return () => clearInterval(intervalRef.current);
  }, [assetId, spotPrice, refreshKey]);

  if (!orderbook) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Loading order book...
      </div>
    );
  }

  const hasOrders = orderbook.asks.length > 0 || orderbook.bids.length > 0;
  const maxAskQty = orderbook.asks.length > 0 ? Math.max(...orderbook.asks.map((a) => a.quantity)) : 1;
  const maxBidQty = orderbook.bids.length > 0 ? Math.max(...orderbook.bids.map((b) => b.quantity)) : 1;
  const spreadVal = orderbook.spread.toFixed(6);
  const spreadPct = orderbook.lastPrice > 0 ? ((orderbook.spread / orderbook.lastPrice) * 100).toFixed(3) : "0";

  const showAsks = viewMode === "both" || viewMode === "asks";
  const showBids = viewMode === "both" || viewMode === "bids";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Top controls */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode("both")} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${viewMode === "both" ? "bg-gray-200" : "hover:bg-gray-100"}`} title="Both">
            <div className="w-3 h-3 flex flex-col gap-[1px]"><div className="h-[3px] bg-red-500 rounded-sm" /><div className="h-[1px] bg-gray-300" /><div className="h-[3px] bg-green-500 rounded-sm" /></div>
          </button>
          <button onClick={() => setViewMode("asks")} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${viewMode === "asks" ? "bg-gray-200" : "hover:bg-gray-100"}`} title="Asks">
            <div className="w-3 h-3 flex flex-col justify-start gap-[1px]"><div className="h-[3px] bg-red-500 rounded-sm" /><div className="h-[3px] bg-red-400 rounded-sm" /></div>
          </button>
          <button onClick={() => setViewMode("bids")} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${viewMode === "bids" ? "bg-gray-200" : "hover:bg-gray-100"}`} title="Bids">
            <div className="w-3 h-3 flex flex-col justify-end gap-[1px]"><div className="h-[3px] bg-green-500 rounded-sm" /><div className="h-[3px] bg-green-400 rounded-sm" /></div>
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span className={`font-semibold ${hasOrders ? "text-emerald-600" : "text-gray-400"}`}>
            {hasOrders ? "On-Chain Orderbook" : "Menunggu Order"}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-2 py-1 text-[10px] font-semibold text-muted-foreground shrink-0 border-b border-border">
        <div>Price (GRD)</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
      </div>

      {!hasOrders ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
          <div>
            <p className="font-semibold mb-1">Order book kosong</p>
            <p>Belum ada order beli/jual</p>
            <p className="text-[10px] mt-1">Pasang limit order untuk memulai perdagangan</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {showAsks && (
            <div className="flex-1 overflow-y-auto flex flex-col-reverse">
              {orderbook.asks.map((ask, i) => (
                <OrderRow key={`ask-${i}`} entry={ask} maxQty={maxAskQty} side="ask" />
              ))}
            </div>
          )}
          <div className="shrink-0 grid grid-cols-3 px-2 py-1 text-[11px] font-mono bg-gray-50/80 border-y border-border">
            <div className="font-bold text-foreground">{spreadVal}</div>
            <div className="text-center font-semibold text-muted-foreground">Spread</div>
            <div className="text-right font-semibold text-muted-foreground">{spreadPct}%</div>
          </div>
          {showBids && (
            <div className="flex-1 overflow-y-auto">
              {orderbook.bids.map((bid, i) => (
                <OrderRow key={`bid-${i}`} entry={bid} maxQty={maxBidQty} side="bid" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
