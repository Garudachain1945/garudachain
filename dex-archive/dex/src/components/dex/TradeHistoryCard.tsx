import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api-config";
import { format } from "date-fns";

interface Trade {
  id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: Date;
}

type FilterMode = "all" | "buys" | "sells";

export function TradeHistoryCard({ assetId, refreshKey }: { symbol?: string; basePrice?: number; assetId?: string; refreshKey?: number }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    function fetchTrades() {
      if (!assetId) return;
      // Fetch real trade log from DEX API
      fetch(apiUrl(`/api/dex/trades/${assetId}`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            const realTrades: Trade[] = data.map((t: any, i: number) => ({
              id: t.trade_id || `trade-${t.timestamp}-${i}`,
              price: ((p) => p > 1000 ? p / 1e8 : p)(t.price_grd || t.price_after || t.price || 0),
              quantity: t.amount || t.token_out || t.token_in || t.quantity || 0,
              side: (t.side || t.direction || (t.buyer_hash160 ? "buy" : "sell")) as "buy" | "sell",
              timestamp: new Date((t.timestamp || 0) * 1000),
            })).reverse(); // newest first
            setTrades(realTrades);
          } else {
            setTrades([]);
          }
        })
        .catch(() => {
          setTrades([]);
        });
    }

    fetchTrades();
    intervalRef.current = setInterval(fetchTrades, 5000);
    return () => clearInterval(intervalRef.current);
  }, [assetId, refreshKey]);

  const filtered = filterMode === "all"
    ? trades
    : filterMode === "buys"
      ? trades.filter(t => t.side === "buy")
      : trades.filter(t => t.side === "sell");

  const hasTrades = trades.length > 0;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top controls */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setFilterMode("all")} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${filterMode === "all" ? "bg-gray-200" : "hover:bg-gray-100"}`} title="All">
            <div className="w-3 h-3 flex flex-col gap-[1px]"><div className="h-[3px] bg-red-500 rounded-sm" /><div className="h-[1px] bg-gray-300" /><div className="h-[3px] bg-green-500 rounded-sm" /></div>
          </button>
          <button onClick={() => setFilterMode("sells")} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${filterMode === "sells" ? "bg-gray-200" : "hover:bg-gray-100"}`} title="Sells">
            <div className="w-3 h-3 flex flex-col justify-start gap-[1px]"><div className="h-[3px] bg-red-500 rounded-sm" /><div className="h-[3px] bg-red-400 rounded-sm" /></div>
          </button>
          <button onClick={() => setFilterMode("buys")} className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${filterMode === "buys" ? "bg-gray-200" : "hover:bg-gray-100"}`} title="Buys">
            <div className="w-3 h-3 flex flex-col justify-end gap-[1px]"><div className="h-[3px] bg-green-500 rounded-sm" /><div className="h-[3px] bg-green-400 rounded-sm" /></div>
          </button>
        </div>
        <div className="text-[10px] font-mono">
          {hasTrades ? (
            <span className="text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              On-Chain ({trades.length})
            </span>
          ) : (
            <span className="text-muted-foreground font-semibold">No Trades</span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-2 py-1 text-[10px] font-semibold text-muted-foreground shrink-0 border-b border-border">
        <div>Time</div>
        <div className="text-right">Size</div>
        <div className="text-right">Price (GRD)</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground px-4 text-center">
            <div>
              <p className="font-semibold mb-1">Belum ada trade on-chain</p>
              <p>Lakukan Swap untuk mulai trading</p>
            </div>
          </div>
        ) : (
          filtered.map((trade) => {
            const sideColor = trade.side === "buy" ? "#16c784" : "#ea3943";
            return (
              <div key={trade.id} className="grid grid-cols-3 px-2 py-[2px] text-[12px] hover:bg-gray-50 transition-colors cursor-default">
                <div className="font-mono tabular-nums text-muted-foreground">
                  {format(trade.timestamp, "HH:mm:ss")}
                </div>
                <div className="text-right font-mono tabular-nums font-medium" style={{ color: sideColor }}>
                  {trade.quantity}
                </div>
                <div className="text-right font-mono tabular-nums" style={{ color: sideColor }}>
                  {trade.price.toFixed(6)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
