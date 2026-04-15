import { Layout } from "@/components/Layout";
import { apiUrl } from "@/lib/api-config";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Wallet, ArrowRight, RefreshCw, Copy, Check, TrendingUp, Coins, BarChart3 } from "lucide-react";

const RED = "#8B0000";

interface AssetHolding {
  asset_id: string;
  symbol: string;
  balance: number;
  name?: string;
  tipe?: string;
  price?: number;
}

interface WalletInfo {
  connected: boolean;
  address: string;
  balance_grd: number;
  assets: AssetHolding[];
}

interface StockInfo {
  symbol: string;
  name: string;
  assetId: string;
  tipe: string;
  price: number;
}

function fmtGRD(v: number, d = 6) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

function fmtRp(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
}

export function Portfolio() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualAddr, setManualAddr] = useState("");
  const [showInput, setShowInput] = useState(false);

  const savedAddr = typeof window !== "undefined" ? localStorage.getItem("garuda_dex_address") : null;

  // Fetch stocks for price data
  useEffect(() => {
    fetch(apiUrl("/api/blockchain/stocks"))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const toGrd = (p: number) => p > 1000 ? p / 1e8 : p;
          setStocks(data.map((s: any) => ({
            symbol: s.kode || s.symbol,
            name: s.nama || s.name,
            assetId: s.asset_id || s.assetId,
            tipe: s.tipe || s.type,
            price: toGrd(s.last_price_grd || s.price || 0),
          })));
        }
      })
      .catch(() => {});
  }, []);

  const loadWallet = async (addr: string) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/dex/wallet/connect?address=${addr}`)).then(r => r.json());
      if (res.connected) {
        setWallet(res);
        localStorage.setItem("garuda_dex_address", addr);
        localStorage.setItem("garuda_dex_connected", "true");
      } else {
        setWallet(null);
      }
    } catch {
      setWallet(null);
    }
    setLoading(false);
  };

  const createWallet = async () => {
    setLoading(true);
    try {
      const label = "user-" + Math.random().toString(36).slice(2, 10);
      const res = await fetch(apiUrl("/api/dex/wallet/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      }).then(r => r.json());
      if (res.connected && res.address) {
        setWallet(res);
        localStorage.setItem("garuda_dex_address", res.address);
        localStorage.setItem("garuda_dex_connected", "true");
      }
    } catch {}
    setLoading(false);
  };

  const refresh = async () => {
    if (!wallet?.address) return;
    setRefreshing(true);
    await loadWallet(wallet.address);
    setRefreshing(false);
  };

  const copyAddress = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-load saved wallet
  useEffect(() => {
    if (savedAddr) {
      loadWallet(savedAddr);
    } else {
      setLoading(false);
    }
  }, []);

  // Enrich assets with stock data
  const enrichedAssets = (wallet?.assets || []).map(a => {
    const stock = stocks.find(s => s.assetId === a.asset_id || s.symbol === a.symbol);
    return {
      ...a,
      name: stock?.name || a.symbol,
      tipe: stock?.tipe || "UNKNOWN",
      price: stock?.price || 0,
    };
  });

  const assetsWithBalance = enrichedAssets.filter(a => a.balance > 0);
  const totalAssetValueGrd = assetsWithBalance.reduce((sum, a) => sum + (a.balance * a.price), 0);
  const totalGrd = (wallet?.balance_grd || 0) + totalAssetValueGrd;
  const totalRp = totalGrd * 1000;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Wallet className="w-6 h-6" style={{ color: RED }} />
          Portfolio
        </h1>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Memuat wallet...</div>
        ) : !wallet ? (
          /* No wallet connected */
          <div className="bg-white border border-border rounded-xl p-8 text-center">
            <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-bold mb-2">Belum ada wallet terhubung</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Buat wallet baru atau masukkan alamat wallet existing untuk melihat portfolio.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={createWallet}
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-colors"
                style={{ background: RED }}
              >
                Buat Wallet Baru
              </button>
              <button
                onClick={() => setShowInput(!showInput)}
                className="px-6 py-2.5 rounded-lg text-sm font-bold border border-border hover:bg-gray-50 transition-colors"
              >
                Masukkan Alamat
              </button>
            </div>
            {showInput && (
              <div className="mt-4 flex gap-2 max-w-md mx-auto">
                <input
                  type="text"
                  value={manualAddr}
                  onChange={e => setManualAddr(e.target.value)}
                  placeholder="grd1q..."
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#8B0000]/20"
                />
                <button
                  onClick={() => manualAddr && loadWallet(manualAddr)}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white"
                  style={{ background: RED }}
                >
                  Connect
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Atau <Link href="/saham" className="underline" style={{ color: RED }}>jelajahi daftar saham</Link> on-chain.
            </p>
          </div>
        ) : (
          /* Wallet connected — show portfolio */
          <div className="space-y-6">
            {/* Wallet Address Card */}
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${RED}15` }}>
                    <Wallet className="w-5 h-5" style={{ color: RED }} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold">Alamat Wallet</p>
                    <p className="font-mono text-sm">{wallet.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={copyAddress} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Copy">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Refresh">
                    <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Total Value */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Nilai</p>
                  <p className="text-xl font-bold" style={{ color: RED }}>{fmtGRD(totalGrd, 4)} GRD</p>
                  <p className="text-xs text-muted-foreground">{fmtRp(totalRp)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Saldo GRD</p>
                  <p className="text-xl font-bold">{fmtGRD(wallet.balance_grd, 4)} GRD</p>
                  <p className="text-xs text-muted-foreground">{fmtRp(wallet.balance_grd * 1000)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Nilai Aset</p>
                  <p className="text-xl font-bold">{fmtGRD(totalAssetValueGrd, 4)} GRD</p>
                  <p className="text-xs text-muted-foreground">{assetsWithBalance.length} aset dimiliki</p>
                </div>
              </div>
            </div>

            {/* Asset Holdings */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Coins className="w-5 h-5" style={{ color: RED }} />
                  Kepemilikan Aset
                </h2>
                <Link href="/saham" className="text-xs font-semibold flex items-center gap-1 hover:underline" style={{ color: RED }}>
                  Lihat Daftar Saham <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {assetsWithBalance.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground">
                  <Coins className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold mb-1">Belum memiliki aset</p>
                  <p className="text-sm">Beli saham langsung dari <Link href="/saham" className="underline" style={{ color: RED }}>halaman saham</Link> atau ikuti <Link href="/ipo" className="underline" style={{ color: RED }}>e-IPO</Link>.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border bg-gray-50/50">
                        <th className="px-6 py-3 font-semibold">Aset</th>
                        <th className="px-6 py-3 font-semibold text-right">Jumlah</th>
                        <th className="px-6 py-3 font-semibold text-right">Harga/Unit</th>
                        <th className="px-6 py-3 font-semibold text-right">Nilai (GRD)</th>
                        <th className="px-6 py-3 font-semibold text-right">Nilai (Rp)</th>
                        <th className="px-6 py-3 font-semibold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetsWithBalance.map((a) => {
                        const value = a.balance * a.price;
                        return (
                          <tr key={a.asset_id} className="border-b border-border/50 hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: a.tipe === "STABLECOIN" ? "#2563eb" : RED }}>
                                  {a.symbol?.slice(0, 2)}
                                </div>
                                <div>
                                  <p className="font-bold text-sm">{a.symbol}</p>
                                  <p className="text-[11px] text-muted-foreground">{a.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-semibold">{a.balance.toLocaleString("id-ID")}</td>
                            <td className="px-6 py-4 text-right font-mono text-sm">
                              {a.price > 0 ? fmtGRD(a.price) : "—"}
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold" style={{ color: RED }}>
                              {a.price > 0 ? fmtGRD(value, 4) : "—"}
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-sm text-muted-foreground">
                              {a.price > 0 ? fmtRp(value * 1000) : "—"}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <Link
                                href={`/saham/${a.symbol}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-border hover:bg-gray-100 transition-colors"
                              >
                                <BarChart3 className="w-3 h-3" /> Detail
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-6 py-3 text-sm">Total</td>
                        <td className="px-6 py-3 text-right text-sm">{assetsWithBalance.length} aset</td>
                        <td className="px-6 py-3"></td>
                        <td className="px-6 py-3 text-right font-mono" style={{ color: RED }}>{fmtGRD(totalAssetValueGrd, 4)}</td>
                        <td className="px-6 py-3 text-right font-mono text-sm text-muted-foreground">{fmtRp(totalAssetValueGrd * 1000)}</td>
                        <td className="px-6 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* All Assets (including zero balance) */}
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: RED }} />
                  Semua Aset di GarudaChain
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
                {enrichedAssets.map((a) => (
                  <div key={a.asset_id} className="px-6 py-4 border-b border-r border-border/50 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: a.tipe === "STABLECOIN" ? "#2563eb" : RED }}>
                          {a.symbol?.slice(0, 2)}
                        </div>
                        <span className="font-bold text-sm">{a.symbol}</span>
                      </div>
                      <span className={`text-xs font-mono ${a.balance > 0 ? "font-bold" : "text-muted-foreground"}`}>
                        {a.balance > 0 ? a.balance.toLocaleString("id-ID") : "0"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{a.name}</p>
                    {a.price > 0 && (
                      <p className="text-[11px] font-mono mt-1" style={{ color: RED }}>{fmtGRD(a.price)} GRD</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
