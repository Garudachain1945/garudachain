import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api-config";
import { AssetLogo } from "@/components/AssetLogo";
import {
  Building2, TrendingUp,
  BarChart3, Coins, CheckCircle2,
  Timer, XCircle, AlertCircle, Wallet, Flame
} from "lucide-react";

interface PresaleData {
  asset_id: string;
  symbol: string;
  tokens_for_sale: number;
  tokens_sold: number;
  price_grd: number;
  grd_raised: number;
  pct_sold: number;
  end_timestamp: number;
  status: string;
  num_buyers?: number;
}

interface StockAsset {
  assetId: string;
  kode: string;
  nama: string;
  totalSupply: number;
  outstanding: number;
  holders: number;
  issueHeight: number;
  status: string;
}

interface WalletState {
  isConnected: boolean;
  address: string;
  balanceGrd: number;
  assets: { asset_id: string; symbol: string; balance: number }[];
}

function fmtGRD(v: number, d = 4) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

function fmtNum(v: number) {
  return new Intl.NumberFormat("id-ID").format(v);
}

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return (
    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-bold">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> OPEN
    </span>
  );
  if (status === "CLOSED") return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-[11px] font-bold">
      <CheckCircle2 className="w-3 h-3" /> CLOSED
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 px-2.5 py-1 rounded-full text-[11px] font-bold">
      <XCircle className="w-3 h-3" /> EXPIRED
    </span>
  );
}

function CountdownTimer({ endTimestamp }: { endTimestamp: number }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const remaining = Math.max(0, endTimestamp - now);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;

  if (remaining <= 0) return <span className="text-muted-foreground text-sm">Berakhir</span>;

  return (
    <div className="flex gap-2">
      {[
        { v: days, l: "Hari" },
        { v: hours, l: "Jam" },
        { v: mins, l: "Mnt" },
        { v: secs, l: "Dtk" },
      ].map(({ v, l }) => (
        <div key={l} className="text-center">
          <div className="bg-[#8B0000] text-white font-mono font-bold text-lg px-2.5 py-1.5 rounded-lg min-w-[44px]">
            {String(v).padStart(2, "0")}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Buy Form for Presale ───
function PresaleBuyForm({ presale, wallet, onSuccess }: {
  presale: PresaleData;
  wallet: WalletState & { connect: () => void; refreshBalance: () => void };
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const qty = parseInt(amount) || 0;
  const cost = qty * presale.price_grd;
  const remaining = presale.tokens_for_sale - presale.tokens_sold;
  const canAfford = wallet.isConnected && cost <= wallet.balanceGrd;
  const validQty = qty > 0 && qty <= remaining;

  const handleBuy = async () => {
    if (!wallet.isConnected || !validQty) return;
    setIsPending(true);
    setResult(null);
    try {
      const res = await fetch(apiUrl("/api/dex/presale/buy"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: presale.asset_id,
          token_amount: qty,
          buyer_address: wallet.address,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setResult(`Error: ${data.error}`);
      } else {
        setResult(`Berhasil beli ${data.tokens_bought || qty} ${presale.symbol}! Cost: ${fmtGRD(data.cost_grd || cost, 4)} GRD`);
        setAmount("");
        wallet.refreshBalance();
        onSuccess();
      }
    } catch {
      setResult("Error: Gagal menghubungi server");
    } finally {
      setIsPending(false);
    }
  };

  if (!wallet.isConnected) {
    return (
      <button
        onClick={() => wallet.connect()}
        className="w-full py-3 rounded-lg text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
      >
        <Wallet className="w-4 h-4" /> Connect Wallet untuk Beli
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Saldo GRD</span>
        <span className="font-mono font-medium">{fmtGRD(wallet.balanceGrd, 4)} GRD</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sisa Token</span>
        <span className="font-mono font-medium">{fmtNum(remaining)} {presale.symbol}</span>
      </div>
      <div className="relative">
        <input
          type="number"
          min="1"
          max={remaining}
          step="1"
          placeholder="Jumlah token"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-gray-50 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-[#8B0000] transition-colors"
        />
        <button
          onClick={() => setAmount(String(Math.min(remaining, Math.floor(wallet.balanceGrd / presale.price_grd))))}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#8B0000] hover:underline"
        >
          MAX
        </button>
      </div>
      {qty > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Jumlah Token</span>
            <span className="font-mono font-bold">{fmtNum(qty)} {presale.symbol}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Harga per Token</span>
            <span className="font-mono">{fmtGRD(presale.price_grd, 6)} GRD</span>
          </div>
          <div className="flex justify-between text-xs border-t border-border pt-1 mt-1">
            <span className="text-muted-foreground font-semibold">Total Biaya</span>
            <span className="font-mono font-bold text-[#8B0000]">{fmtGRD(cost, 4)} GRD</span>
          </div>
          {!canAfford && (
            <p className="text-[11px] text-red-500 font-medium">Saldo GRD tidak mencukupi</p>
          )}
        </div>
      )}
      <button
        onClick={handleBuy}
        disabled={isPending || !validQty || !canAfford}
        className="w-full py-3 rounded-lg text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Memproses..." : `Beli ${qty > 0 ? fmtNum(qty) : ""} ${presale.symbol}`}
      </button>
      {result && (
        <div className={`text-xs p-2 rounded-lg ${result.startsWith("Error") ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
          {result}
        </div>
      )}
    </div>
  );
}

function PresaleCard({ presale, stocks, wallet, onRefresh }: {
  presale: PresaleData;
  stocks: StockAsset[];
  wallet: WalletState & { connect: () => void; refreshBalance: () => void };
  onRefresh: () => void;
}) {
  const stock = stocks.find(s => s.kode === presale.symbol);
  const pctSold = presale.pct_sold;
  const isOpen = presale.status === "OPEN";
  const isClosed = presale.status === "CLOSED";

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all hover:shadow-lg ${isOpen ? "border-emerald-200 ring-1 ring-emerald-100" : "border-border"}`}>
      {/* Header */}
      <div className={`px-5 py-4 ${isOpen ? "bg-gradient-to-r from-emerald-50 to-teal-50" : "bg-gray-50"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <AssetLogo symbol={presale.symbol} size={44} tipe="SAHAM" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">{presale.symbol}</h3>
                <StatusBadge status={presale.status} />
              </div>
              <p className="text-[12px] text-muted-foreground">{stock?.nama || "Token Saham"}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Harga per Token</p>
            <p className="font-bold text-lg text-[#8B0000]">{fmtGRD(presale.price_grd)} GRD</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 py-4">
        <div className="flex justify-between text-[12px] mb-2">
          <span className="text-muted-foreground">Progress Penjualan</span>
          <span className="font-bold text-foreground">{pctSold.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${pctSold >= 80 ? "bg-emerald-500" : pctSold >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
            style={{ width: `${Math.min(100, pctSold)}%` }}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Token Dijual</p>
            <p className="font-bold text-sm mt-0.5">{fmtNum(presale.tokens_sold)} / {fmtNum(presale.tokens_for_sale)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Dana Terkumpul</p>
            <p className="font-bold text-sm mt-0.5 text-[#8B0000]">{fmtGRD(presale.grd_raised, 2)} GRD</p>
          </div>
        </div>

        {/* Countdown / Status */}
        {isOpen && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
              <Timer className="w-3 h-3" /> Berakhir dalam:
            </p>
            <CountdownTimer endTimestamp={presale.end_timestamp} />
          </div>
        )}

        {/* Burned info for closed presales */}
        {isClosed && pctSold < 100 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 rounded-lg p-2.5">
              <Flame className="w-4 h-4 shrink-0" />
              <span>
                <strong>{fmtNum(presale.tokens_for_sale - presale.tokens_sold)}</strong> token tidak terjual telah di-burn (dimusnahkan) dari supply
              </span>
            </div>
          </div>
        )}

        {/* Buy Form for OPEN presales */}
        {isOpen && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[13px] font-bold mb-3 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-[#8B0000]" /> Beli Token e-IPO
            </p>
            <PresaleBuyForm presale={presale} wallet={wallet} onSuccess={onRefresh} />
          </div>
        )}

        {/* CTA for closed */}
        {!isOpen && (
          <div className="mt-4 flex gap-2">
            <Link
              href={`/saham/${presale.symbol}`}
              className="w-full text-center py-2.5 rounded-lg text-[13px] font-bold border border-border hover:bg-gray-50 transition-colors"
            >
              Detail Saham
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function IPOSaham() {
  const [presales, setPresales] = useState<PresaleData[]>([]);
  const [stocks, setStocks] = useState<StockAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "open" | "closed">("all");

  // Wallet state
  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false, address: "", balanceGrd: 0, assets: [],
  });

  const connectWallet = async () => {
    try {
      const res = await fetch(apiUrl("/api/dex/wallet/connect")).then(r => r.json());
      if (res.connected) {
        setWallet({
          isConnected: true,
          address: res.address,
          balanceGrd: res.balance_grd,
          assets: res.assets || [],
        });
      }
    } catch { /* ignore */ }
  };

  const refreshBalance = async () => {
    try {
      const res = await fetch(apiUrl("/api/dex/wallet/connect")).then(r => r.json());
      if (res.connected) {
        setWallet(prev => ({
          ...prev,
          balanceGrd: res.balance_grd,
          assets: res.assets || [],
        }));
      }
    } catch { /* ignore */ }
  };

  const walletProps = { ...wallet, connect: connectWallet, refreshBalance };

  const fetchPresales = () => {
    fetch(apiUrl("/api/blockchain/presales")).then(r => r.json()).then(setPresales).catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      fetch(apiUrl("/api/blockchain/presales")).then(r => r.json()).catch(() => []),
      fetch(apiUrl("/api/blockchain/stocks")).then(r => r.json()).catch(() => []),
    ]).then(([presaleData, stockData]) => {
      setPresales(presaleData);
      setStocks(stockData);
      setLoading(false);
    });

    const iv = setInterval(fetchPresales, 10000);
    return () => clearInterval(iv);
  }, []);

  const filtered = presales.filter(p => {
    if (tab === "open") return p.status === "OPEN";
    if (tab === "closed") return p.status !== "OPEN";
    return true;
  });

  const openCount = presales.filter(p => p.status === "OPEN").length;
  const closedCount = presales.filter(p => p.status !== "OPEN").length;
  const totalRaised = presales.reduce((s, p) => s + p.grd_raised, 0);
  const totalTokensSold = presales.reduce((s, p) => s + p.tokens_sold, 0);

  return (
    <Layout>
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Coins className="w-8 h-8" />
                <h1 className="text-2xl font-bold">e-IPO & Presale Saham</h1>
              </div>
              <p className="text-white/70 text-sm max-w-2xl">
                Initial Public Offering (e-IPO) on-chain di GarudaChain. Beli token saham langsung dari emiten saat presale,
                setelah selesai token yang tidak terjual di-burn, lalu saham tercatat di on-chain order book untuk trading bebas.
              </p>
            </div>
            {/* Wallet Status */}
            <div className="shrink-0">
              {wallet.isConnected ? (
                <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="w-4 h-4 text-emerald-300" />
                    <span className="font-mono text-xs">{wallet.address.slice(0, 12)}...{wallet.address.slice(-6)}</span>
                  </div>
                  <p className="font-bold text-emerald-300">{fmtGRD(wallet.balanceGrd, 4)} GRD</p>
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  className="bg-white text-[#8B0000] px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" /> Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* How e-IPO Works */}
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-primary" />
            Bagaimana e-IPO Bekerja
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { step: "1", title: "Emiten Buat Token", desc: "Perusahaan membuat token saham dan menentukan harga serta jumlah presale", icon: Building2 },
              { step: "2", title: "Presale Dibuka", desc: "Investor beli token dengan GRD selama periode presale berlangsung", icon: Coins },
              { step: "3", title: "Presale Ditutup", desc: "Token didistribusikan ke pembeli, sisa yang tidak terjual di-burn", icon: Flame },
              { step: "4", title: "Listing di DEX", desc: "Saham muncul di orderbook DEX, bisa diperdagangkan bebas", icon: BarChart3 },
              { step: "5", title: "Trading Bebas", desc: "Jual beli via Order Book (DEX) dengan harga ditentukan pasar", icon: TrendingUp },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                  {item.step}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <item.icon className="w-3.5 h-3.5 text-primary" />
                    <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Presale</p>
            <p className="text-[20px] font-bold text-foreground">{loading ? "..." : presales.length}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Presale Aktif</p>
            <p className="text-[20px] font-bold text-emerald-600">{loading ? "..." : openCount}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Dana Raised</p>
            <p className="text-[20px] font-bold text-[#8B0000]">{loading ? "..." : `${fmtGRD(totalRaised, 2)} GRD`}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Token Terjual</p>
            <p className="text-[20px] font-bold text-foreground">{loading ? "..." : fmtNum(totalTokensSold)}</p>
          </div>
        </div>

        {/* Presale Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              Presale e-IPO
            </h2>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {([
                { key: "all" as const, label: `Semua (${presales.length})` },
                { key: "open" as const, label: `Aktif (${openCount})` },
                { key: "closed" as const, label: `Selesai (${closedCount})` },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    tab === t.key ? "bg-white text-[#8B0000] shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading presale data dari blockchain...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 bg-white border border-border rounded-xl">
              <Coins className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">
                {tab === "open" ? "Tidak ada presale yang sedang aktif" : "Belum ada data presale"}
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Presale akan muncul otomatis ketika emiten membuat e-IPO on-chain
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map(p => (
                <PresaleCard key={p.asset_id} presale={p} stocks={stocks} wallet={walletProps} onRefresh={fetchPresales} />
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
