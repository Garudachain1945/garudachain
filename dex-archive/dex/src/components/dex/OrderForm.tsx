import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { Pencil } from "lucide-react";

function fmtGrd(v: number) {
  if (v < 1) return v.toFixed(8) + " GRD";
  if (v < 100) return v.toFixed(4) + " GRD";
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " GRD";
}

function fmtToken(v: number, symbol: string) {
  if (v === 0) return "—";
  if (v < 1) return v.toFixed(8) + " " + symbol;
  if (v < 1000) return v.toFixed(4) + " " + symbol;
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v) + " " + symbol;
}

interface OrderFormProps {
  symbol: string;
  basePrice: number;
  assetId?: string;
  latestBlock?: number;
  wallet?: {
    isConnected: boolean;
    address: string;
    l1Type?: string;
    balanceGrd: number;
    assets: { asset_id: string; symbol: string; balance: number }[];
    connect: () => void;
    refreshBalance: () => void;
  };
  onTradeExecuted?: () => void;
}

export function OrderForm({ symbol, basePrice, assetId, latestBlock, wallet, onTradeExecuted }: OrderFormProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [pctValue, setPctValue] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);

  const { toast } = useToast();
  const isConnected = wallet?.isConnected ?? false;

  // Available balance for current side
  const availableGrd = wallet?.balanceGrd ?? 0;
  const assetBalance = wallet?.assets?.find(a => a.symbol === symbol)?.balance ?? 0;
  const available = side === "buy" ? availableGrd : assetBalance;
  const availableLabel = side === "buy" ? `${fmtGrd(availableGrd)}` : `${fmtToken(assetBalance, symbol)}`;

  const qty = parseFloat(amount) || 0;
  const price = orderType === "limit" ? (parseFloat(limitPrice) || basePrice) : basePrice;
  const orderValue = side === "buy" ? qty : qty * price;
  const orderSize = side === "buy" ? (price > 0 ? qty / price : 0) : qty;

  // Slider → set amount based on % of available balance
  const handlePctChange = (pct: number) => {
    setPctValue(pct);
    if (pct === 0) {
      setAmount("");
      return;
    }
    const maxAmount = available * (pct / 100);
    if (side === "buy") {
      // Buy: amount is in GRD
      setAmount(maxAmount > 0 ? maxAmount.toFixed(8) : "");
    } else {
      // Sell: amount is in tokens
      setAmount(maxAmount > 0 ? maxAmount.toFixed(4) : "");
    }
  };

  // Reset form when switching side
  useEffect(() => {
    setAmount("");
    setPctValue(0);
  }, [side]);

  // On-chain orderbook: place limit/market order via RPC
  const handleExecute = async () => {
    if (!wallet?.isConnected || !assetId || qty <= 0) return;

    // Limit order requires a price
    if (orderType === "limit" && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      toast({ title: "Harga Diperlukan", description: "Masukkan harga limit untuk order", variant: "destructive" });
      return;
    }

    setIsPending(true);
    try {
      const orderPrice = orderType === "limit" ? parseFloat(limitPrice) : price;
      const orderAmount = Math.floor(qty); // Token quantity must be integer

      if (orderAmount <= 0) {
        toast({ title: "Jumlah Invalid", description: "Masukkan jumlah token yang valid", variant: "destructive" });
        setIsPending(false);
        return;
      }

      // Prefer client-side signing via extension (Web3 pattern)
      const provider = (window as any).garuda;
      if (provider?.isGarudaChain && wallet.l1Type === "extension") {
        try {
          const data = await provider.placeOrder({
            assetId,
            side,
            price: orderPrice,
            amount: orderAmount,
            address: wallet.address,
          });
          const desc = data?.txid
            ? `Order ${side} ${orderAmount} ${symbol} @ ${orderPrice.toFixed(6)} GRD berhasil. TX: ${data.txid.slice(0, 12)}...`
            : `Order masuk ke orderbook on-chain.`;
          toast({ title: `${side === "buy" ? "Buy" : "Sell"} Order Berhasil`, description: desc });
          setAmount(""); setPctValue(0); setLimitPrice("");
          wallet.refreshBalance();
          onTradeExecuted?.();
        } catch (err: any) {
          toast({ title: "Order Gagal", description: err?.message || "Ditolak pengguna", variant: "destructive" });
        }
        setIsPending(false);
        return;
      }

      // Fallback: server-side order (dev/testing)
      const res = await fetch(apiUrl("/api/dex/order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_type: orderType,
          side,
          asset_id: assetId,
          amount: orderAmount,
          price: orderPrice,
          address: wallet.address,
        }),
      });
      const data = await res.json();

      if (res.ok && !data.error) {
        const desc = data.txid
          ? `Order ${side} ${orderAmount} ${symbol} @ ${orderPrice.toFixed(6)} GRD berhasil on-chain. TX: ${data.txid.slice(0,12)}...`
          : `Order masuk ke orderbook on-chain.`;
        toast({
          title: `${side === "buy" ? "Buy" : "Sell"} Order Berhasil`,
          description: desc,
        });
        setAmount("");
        setPctValue(0);
        setLimitPrice("");
        wallet.refreshBalance();
        onTradeExecuted?.();
      } else {
        toast({
          title: "Order Gagal",
          description: data.error || JSON.stringify(data),
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Error", description: "Gagal menghubungi server", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-white h-full flex flex-col">
      {/* Order Type Tabs: Market | Limit */}
      <div className="flex items-center border-b border-border shrink-0">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-all ${
              orderType === t ? "text-foreground border-b-2 border-[#8B0000]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "market" ? "Market" : "Limit"}
          </button>
        ))}
      </div>

      <div className="p-3 flex-1 overflow-y-auto">
        {/* Buy / Sell Toggle */}
        <div className="flex gap-0 mb-4">
          <button
            onClick={() => setSide("buy")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-l-lg transition-all ${
              side === "buy" ? "bg-emerald-500 text-white" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"
            }`}
          >
            Buy / Long
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-r-lg transition-all ${
              side === "sell" ? "bg-[#CC0001] text-white" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"
            }`}
          >
            Sell / Short
          </button>
        </div>

        <div className="space-y-3">
          {/* Available to Trade */}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Available to Trade</span>
            <span className="text-foreground font-medium font-mono">{isConnected ? availableLabel : "—"}</span>
          </div>

          {/* Position */}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Position</span>
            <span className="text-foreground font-medium font-mono">
              {isConnected && assetBalance > 0 ? fmtToken(assetBalance, symbol) : "—"}
            </span>
          </div>

          {/* Limit Price (for limit orders) */}
          {orderType === "limit" && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">Limit Price</span>
              <input
                type="number"
                step="any"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={basePrice.toFixed(8)}
                className="w-full bg-gray-50 border border-border rounded-md px-3 py-2.5 text-right pr-12 font-mono text-sm outline-none focus:border-[#8B0000] transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">GRD</span>
            </div>
          )}

          {/* Amount */}
          <div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">Amount</span>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setPctValue(0); }}
                className="w-full bg-gray-50 border border-border rounded-md px-3 py-2.5 text-right pr-16 font-mono text-sm outline-none focus:border-[#8B0000] transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground">
                {side === "buy" ? "GRD" : symbol}
              </span>
            </div>
          </div>

          {/* Percentage Slider */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 relative flex items-center cursor-pointer select-none"
              style={{ height: 24 }}
              onMouseDown={(e) => {
                e.preventDefault();
                const el = e.currentTarget;
                const update = (clientX: number) => {
                  const rect = el.getBoundingClientRect();
                  const pct = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
                  handlePctChange(pct);
                };
                update(e.clientX);
                const move = (ev: MouseEvent) => { requestAnimationFrame(() => update(ev.clientX)); };
                const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
                document.addEventListener("mousemove", move);
                document.addEventListener("mouseup", up);
              }}
            >
              {/* Track */}
              <div className="absolute inset-x-0 rounded-sm overflow-hidden" style={{ height: 6, background: "hsl(var(--muted))" }}>
                <div className="absolute left-0 top-0 h-full rounded-sm" style={{ width: `${pctValue}%`, background: "hsl(var(--primary))" }} />
                {/* Tick marks */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="absolute top-0" style={{ left: `${(i + 1) * 5}%`, width: 1, height: "100%", background: "hsl(var(--border) / 0.5)" }} />
                ))}
              </div>
              {/* Thumb */}
              <div
                className="absolute rounded-full shadow"
                style={{
                  left: `calc(${pctValue}% - 6px)`,
                  width: 12, height: 12,
                  background: "hsl(var(--primary))",
                  border: "2px solid hsl(var(--background))",
                }}
              />
            </div>
            <div className="flex items-center border border-border rounded overflow-hidden shrink-0">
              <input
                type="number"
                min="0"
                max="100"
                value={pctValue}
                onChange={(e) => handlePctChange(Number(e.target.value))}
                className="w-10 text-center bg-transparent text-[11px] font-mono text-foreground outline-none py-1"
              />
              <span className="text-[11px] text-muted-foreground pr-1.5">%</span>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-[#8B0000]" />
              Reduce Only
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-[#8B0000]" />
              Take Profit / Stop Loss
            </label>
          </div>

          {/* Connect Wallet / Submit */}
          {!isConnected ? (
            <button
              type="button"
              onClick={() => wallet?.connect()}
              className="w-full py-3 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
            >
              Connect Wallet to Trade
            </button>
          ) : qty <= 0 ? (
            <button
              type="button"
              disabled
              className="w-full py-3 rounded-lg text-sm font-bold text-white bg-gray-300 cursor-not-allowed"
            >
              Enter an Amount
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPending}
              className={`w-full py-3 rounded-lg text-sm font-bold text-white uppercase tracking-wide transition-all disabled:opacity-60 ${
                side === "buy" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-[#CC0001] hover:bg-[#AA0001]"
              }`}
            >
              {isPending ? "Memproses..." : side === "buy" ? `BUY / LONG ${symbol}` : `SELL / SHORT ${symbol}`}
            </button>
          )}

          {/* Order Info */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Order Size</span>
              <span className="text-foreground font-medium font-mono">
                {qty > 0 ? (side === "buy" ? fmtToken(orderSize, symbol) : fmtToken(qty, symbol)) : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Order Value</span>
              <span className="text-foreground font-medium font-mono">
                {qty > 0 ? fmtGrd(orderValue) : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Est. Liq. Price</span>
              <span className="text-foreground font-medium font-mono">—</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Position Margin</span>
              <span className="text-foreground font-medium font-mono">{isConnected ? "0.00 GRD" : "—"}</span>
            </div>
            {orderType === "market" && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Est. Price</span>
                  <span className="text-foreground font-medium font-mono">{basePrice > 0 ? basePrice.toFixed(8) + " GRD" : "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Slippage</span>
                  <span className="text-foreground font-medium">
                    Est: 0.00% | Max: 1% <Pencil className="w-3 h-3 inline text-muted-foreground" />
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Fees</span>
              <span className="text-foreground font-medium">Taker: 0% | Maker: 0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
