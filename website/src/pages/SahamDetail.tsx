import { Layout } from "@/components/Layout";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { formatNumber } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { useState, useEffect } from "react";
import {
  ArrowLeft, Building2, Shield, Globe, BarChart3,
  Layers, Users, Coins, CheckCircle2, Landmark, Banknote, FileText
} from "lucide-react";
import { AssetLogo } from "@/components/AssetLogo";
import { VerifiedBadge } from "@/components/VerifiedBadge";

// Matches the actual /api/blockchain/stock/{assetId} response
interface StockData {
  assetId: string;
  kode: string;
  nama: string;
  tipe: string;
  totalSupply: number;
  outstanding: number;
  supply: number;
  issueHeight: number;
  issueTxid: string;
  numHolders: number;
  price: number;
  status: string;
  tradeCount: number;
  holders: { address: string; balance: number; percentage: number }[];
  trades: any[];
  orderbook: { asks: any[]; bids: any[] };
  // Presale info (fetched separately)
  presale?: {
    asset_id: string;
    symbol: string;
    tokens_for_sale: number;
    tokens_sold: number;
    tokens_remaining: number;
    price_per_unit_grd: number;
    grd_raised: number;
    pct_sold: number;
    end_timestamp: number;
    seconds_remaining: number;
    status: string;
    num_buyers: number;
    buyers: { address: string; tokens: number; grd_paid: number }[];
  } | null;
}

function fmtGRD(v: number, d = 6) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

function toGrd(p: number) {
  return p > 1000 ? p / 1e8 : p;
}

export function SahamDetail() {
  const params = useParams<{ kode: string }>();
  const kode = params.kode?.toUpperCase() ?? "";
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 15000 } });
  const latestBlock = stats?.latestBlock ?? 0;

  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "holders" | "presale" | "pool" | "dividend">("overview");
  const [meta, setMeta] = useState<{
    sector?: string; website?: string;
    social_x?: string; social_ig?: string; social_yt?: string;
    social_fb?: string; social_li?: string; social_tt?: string;
    doc1_url?: string; doc1_name?: string;
    doc2_url?: string; doc2_name?: string;
  } | null>(null);

  // First fetch the stocks list to find asset_id by kode
  useEffect(() => {
    setLoading(true);
    setError(false);
    async function fetchData() {
      try {
        const stocks = await fetch(apiUrl("/api/blockchain/stocks")).then(r => r.json());
        const stock = stocks.find((s: any) => s.kode === kode);
        if (!stock) { setError(true); setLoading(false); return; }
        // Fetch stock detail and presale in parallel
        const [detail, presaleData] = await Promise.all([
          fetch(apiUrl(`/api/blockchain/stock/${stock.assetId}`)).then(r => r.json()).catch(() => null),
          fetch(apiUrl(`/api/blockchain/presale/${stock.assetId}`)).then(r => r.json()).catch(() => null),
        ]);
        if (detail && detail.kode) {
          detail.presale = presaleData?.status ? presaleData : null;
          setStockData(detail);
        }
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    }
    fetchData();
    // Fetch metadata (sector, website, social, docs)
    fetch(apiUrl(`/api/asset/metadata/${kode}`)).then(r => r.json()).then(setMeta).catch(() => {});
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [kode]);

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading data saham {kode} dari blockchain...</p>
        </div>
      </Layout>
    );
  }

  if (error || !stockData) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <Building2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Saham Tidak Ditemukan</h1>
          <p className="text-muted-foreground mb-6">Token saham "{kode}" belum terdaftar di GarudaChain</p>
          <Link href="/saham" className="text-primary hover:underline font-medium">
            &larr; Kembali ke Daftar Saham
          </Link>
        </div>
      </Layout>
    );
  }

  const { presale } = stockData;
  // Harga dari orderbook (last trade) atau presale price
  const lastTradePrice = stockData.trades?.length > 0 ? toGrd(stockData.trades[stockData.trades.length - 1]?.price_grd ?? 0) : 0;
  const bestAsk = stockData.orderbook?.asks?.[0]?.price ? toGrd(stockData.orderbook.asks[0].price) : 0;
  const bestBid = stockData.orderbook?.bids?.[0]?.price ? toGrd(stockData.orderbook.bids[0].price) : 0;
  const spotPrice = lastTradePrice > 0 ? lastTradePrice : (bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : presale?.price_per_unit_grd ?? stockData.price ?? 0);
  const priceRp = spotPrice * 1000;
  const numHolders = stockData.numHolders ?? stockData.holders?.length ?? 0;
  const totalUnits = stockData.totalSupply;
  const tradeCount = stockData.tradeCount ?? stockData.trades?.length ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = spread > 0 && spotPrice > 0 ? (spread / spotPrice) * 100 : 0;
  const askCount = stockData.orderbook?.asks?.length ?? 0;
  const bidCount = stockData.orderbook?.bids?.length ?? 0;

  return (
    <Layout>
      {/* Header */}
      <div className="bg-white border-b border-border py-6">
        <div className="container mx-auto px-4">
          <Link href="/saham" className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Saham
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <AssetLogo symbol={kode} size={48} tipe={stockData?.tipe} />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{kode}</h1>
                <VerifiedBadge
                  type={stockData?.tipe ?? "SAHAM"}
                  transfers={stockData?.tradeCount ?? 0}
                  size={22}
                />
                <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  Aktif Trading
                </span>
                {presale && (
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${presale.status === "OPEN" ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
                    Presale: {presale.status}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{stockData.nama}</p>
              {/* Company metadata row */}
              {meta && (meta.sector || meta.website || meta.social_x || meta.social_li || meta.social_yt || meta.social_tt) && (
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {meta.sector && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 font-medium">{meta.sector}</span>
                  )}
                  {meta.website && (
                    <a href={meta.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <Globe className="w-3 h-3" /> Website
                    </a>
                  )}
                  {meta.social_x && <a href={meta.social_x} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">X</a>}
                  {meta.social_li && <a href={meta.social_li} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">LinkedIn</a>}
                  {meta.social_yt && <a href={meta.social_yt} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">YouTube</a>}
                  {meta.social_tt && <a href={meta.social_tt} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">TikTok</a>}
                  {meta.doc1_url && (
                    <a href={meta.doc1_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <FileText className="w-3 h-3" /> {meta.doc1_name || "Prospektus"}
                    </a>
                  )}
                  {meta.doc2_url && (
                    <a href={meta.doc2_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <FileText className="w-3 h-3" /> {meta.doc2_name || "Legalitas"}
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="text-right hidden md:block">
              <p className="text-2xl font-bold text-foreground">{fmtGRD(spotPrice)} GRD</p>
              <p className="text-muted-foreground text-sm">= Rp {priceRp.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Harga Terakhir</p>
            <p className="text-[18px] font-bold text-[#8B0000]">{fmtGRD(spotPrice)} GRD</p>
            <p className="text-[11px] text-muted-foreground">= Rp {priceRp.toFixed(2)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Total Supply</p>
            <p className="text-[18px] font-bold">{formatNumber(stockData.totalSupply)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Holders</p>
            <p className="text-[18px] font-bold text-emerald-600">{numHolders}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Total Transaksi</p>
            <p className="text-[18px] font-bold">{tradeCount}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Order Book</p>
            <p className="text-[18px] font-bold">{(stockData.orderbook?.asks?.length ?? 0) + (stockData.orderbook?.bids?.length ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground">order aktif</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-6 w-fit">
          {([
            { key: "overview" as const, label: "Overview & Chart", icon: BarChart3 },
            { key: "holders" as const, label: `Holders (${numHolders})`, icon: Users },
            { key: "presale" as const, label: "e-IPO Presale", icon: Coins },
            { key: "pool" as const, label: "Order Book", icon: Landmark },
            { key: "dividend" as const, label: "Dividen", icon: Banknote },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                activeTab === t.key ? "bg-white text-[#8B0000] shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Price Snapshot + Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Live Price & Orderbook Snapshot — number-only, no chart */}
              <div className="bg-white border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Harga & Order Book {kode}/GRD
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    On-Chain Live
                  </span>
                </div>

                {/* Spot price headline */}
                <div className="px-5 py-5 border-b border-border bg-gray-50/50">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Harga Terakhir</p>
                  <p className="text-3xl font-bold text-[#8B0000] font-mono">{fmtGRD(spotPrice)} <span className="text-base text-muted-foreground font-normal">GRD</span></p>
                  <p className="text-sm text-muted-foreground mt-0.5">≈ Rp {priceRp.toFixed(2)}</p>
                </div>

                {/* Best bid / spread / best ask */}
                <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                  <div className="px-5 py-4">
                    <p className="text-[10px] text-green-700 uppercase tracking-wide font-semibold mb-1">Best Bid</p>
                    <p className="font-bold text-lg text-green-700 font-mono tabular-nums">{bestBid > 0 ? fmtGRD(bestBid) : "—"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{bidCount} order beli</p>
                  </div>
                  <div className="px-5 py-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Spread</p>
                    <p className="font-bold text-lg text-foreground font-mono tabular-nums">{spread > 0 ? fmtGRD(spread) : "—"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{spread > 0 ? `${spreadPct.toFixed(3)}%` : "—"}</p>
                  </div>
                  <div className="px-5 py-4 text-right">
                    <p className="text-[10px] text-red-700 uppercase tracking-wide font-semibold mb-1">Best Ask</p>
                    <p className="font-bold text-lg text-red-700 font-mono tabular-nums">{bestAsk > 0 ? fmtGRD(bestAsk) : "—"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{askCount} order jual</p>
                  </div>
                </div>

                {/* Volume & activity stats */}
                <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                  <div className="px-5 py-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Total Transaksi</p>
                    <p className="font-bold text-lg text-foreground font-mono tabular-nums">{formatNumber(tradeCount)}</p>
                  </div>
                  <div className="px-5 py-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Order Aktif</p>
                    <p className="font-bold text-lg text-foreground font-mono tabular-nums">{askCount + bidCount}</p>
                  </div>
                  <div className="px-5 py-4 text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Holders</p>
                    <p className="font-bold text-lg text-emerald-600 font-mono tabular-nums">{formatNumber(numHolders)}</p>
                  </div>
                </div>

                <div className="px-5 py-3 bg-gray-50/50 text-[11px] text-muted-foreground text-center">
                  Harga ditentukan oleh on-chain order book — tidak ada chart, semua data langsung dari blockchain.
                  Lihat tab <span className="font-semibold text-foreground">Order Book</span> untuk daftar lengkap.
                </div>
              </div>

              {/* Token On-Chain Info */}
              <div className="bg-white border border-border rounded-lg">
                <div className="px-5 py-3 border-b border-border">
                  <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Informasi Token On-Chain
                  </h3>
                </div>
                <div className="px-5 py-2">
                  {[
                    { label: "Asset ID", value: stockData.assetId, mono: true },
                    { label: "Issue TX", value: stockData.issueTxid, mono: true },
                    { label: "Token Type", value: stockData.tipe.toUpperCase() },
                    { label: "Total Supply", value: `${formatNumber(stockData.totalSupply)} token` },
                    { label: "Issue Block", value: `#${formatNumber(stockData.issueHeight)}` },
                    { label: "Issuer (hash160)", value: "—", mono: true },
                    { label: "Platform", value: "GarudaChain" },
                    { label: "Settlement", value: "T+0 (Instant On-Chain)" },
                  ].map(item => (
                    <div key={item.label} className="flex items-start py-2.5 border-b border-border last:border-0">
                      <span className="text-[12px] text-muted-foreground w-[160px] shrink-0 pt-0.5">{item.label}:</span>
                      <span className={`text-[12px] text-foreground break-all ${item.mono ? "font-mono text-[11px]" : ""}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="space-y-6">
              {/* Blockchain Info */}
              <div className="bg-white border border-border rounded-lg p-5">
                <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  Blockchain Info
                </h3>
                <div className="space-y-3 text-[12px]">
                  {[
                    { label: "Network", value: "GarudaChain" },
                    { label: "Block Height", value: formatNumber(latestBlock) },
                    { label: "Peg Rate", value: "1 GRD = Rp 1.000" },
                    { label: "Settlement", value: "T+0 (Instant)" },
                    { label: "Trading", value: "Order Book" },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security */}
              <div className="bg-white border border-border rounded-lg p-5">
                <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Keamanan
                </h3>
                <div className="space-y-3 text-[12px]">
                  {[
                    { label: "On-Chain Verified", value: "Yes" },
                    { label: "Order Book Active", value: (stockData.orderbook?.asks?.length ?? 0) + (stockData.orderbook?.bids?.length ?? 0) > 0 ? "Yes" : "No" },
                    { label: "e-IPO Complete", value: presale?.status === "CLOSED" ? "Yes" : presale ? "Ongoing" : "N/A" },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-1 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold text-emerald-600">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "holders" && (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Daftar Pemegang Saham ({numHolders} holder)
              </h3>
              <span className="text-[11px] text-muted-foreground">Total: {formatNumber(totalUnits)} token</span>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Alamat Wallet</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Jumlah Token</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">% Kepemilikan</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Nilai (GRD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stockData.holders?.map((h: { address: string; balance: number; percentage: number }, idx: number) => (
                  <tr key={h.address} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      <Link href={`/address/${h.address}`} className="text-primary hover:underline">
                        {h.address}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(h.balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-[#8B0000] h-full rounded-full" style={{ width: `${Math.min(100, h.percentage)}%` }} />
                        </div>
                        <span className="font-semibold text-[12px]">{h.percentage.toFixed(2)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {fmtGRD(h.balance * spotPrice, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "presale" && (
          <div className="space-y-6">
            {presale ? (
              <>
                {/* Presale Summary */}
                <div className="bg-white border border-border rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Coins className="w-5 h-5 text-primary" />
                      e-IPO Presale — {kode}
                    </h3>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold ${
                      presale.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {presale.status === "OPEN" && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                      {presale.status === "OPEN" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {presale.status}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Progress Penjualan</span>
                      <span className="font-bold text-[#8B0000]">{presale.pct_sold.toFixed(1)}% Terjual</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#8B0000] to-[#C00020] transition-all duration-1000 flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(5, presale.pct_sold)}%` }}
                      >
                        <span className="text-white text-[10px] font-bold">{presale.pct_sold.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Token Dijual</p>
                      <p className="font-bold text-base mt-1">{formatNumber(presale.tokens_sold)}</p>
                      <p className="text-[11px] text-muted-foreground">/ {formatNumber(presale.tokens_for_sale)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Token Sisa</p>
                      <p className="font-bold text-base mt-1">{formatNumber(presale.tokens_remaining)}</p>
                      <p className="text-[11px] text-muted-foreground">dikembalikan ke emiten</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Dana Raised</p>
                      <p className="font-bold text-base mt-1 text-[#8B0000]">{fmtGRD(presale.grd_raised, 2)} GRD</p>
                      <p className="text-[11px] text-muted-foreground">= Rp {formatNumber(presale.grd_raised * 1000)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Harga per Token</p>
                      <p className="font-bold text-base mt-1">{fmtGRD(presale.price_per_unit_grd, 4)} GRD</p>
                      <p className="text-[11px] text-muted-foreground">fixed price</p>
                    </div>
                  </div>
                </div>

                {/* Buyers Table */}
                <div className="bg-white border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border">
                    <h3 className="text-[14px] font-bold flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Pembeli Presale ({presale.num_buyers} investor)
                    </h3>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead className="bg-gray-50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">#</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Alamat Investor</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Token Dibeli</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">GRD Dibayar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {presale.buyers.map((b, idx) => (
                        <tr key={b.address} className="hover:bg-red-50/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-[12px] text-primary">{b.address}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(b.tokens)}</td>
                          <td className="px-4 py-3 text-right font-mono text-[#8B0000] font-semibold">{fmtGRD(b.grd_paid, 2)} GRD</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="bg-white border border-border rounded-xl p-12 text-center">
                <Coins className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Tidak ada data presale untuk {kode}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "pool" && (
          <div className="space-y-6">
            <div className="bg-white border border-border rounded-xl p-6">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Landmark className="w-5 h-5 text-[#8B0000]" />
                Order Book — {kode}/GRD
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-[10px] text-[#8B0000] uppercase tracking-wide font-semibold">Harga Terakhir</p>
                  <p className="font-bold text-xl mt-1 text-[#8B0000]">{fmtGRD(spotPrice)} GRD</p>
                  <p className="text-[11px] text-muted-foreground">= Rp {priceRp.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-[10px] text-green-700 uppercase tracking-wide font-semibold">Best Bid</p>
                  <p className="font-bold text-xl mt-1 text-green-700">{bestBid > 0 ? fmtGRD(bestBid) : "—"}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-[10px] text-red-700 uppercase tracking-wide font-semibold">Best Ask</p>
                  <p className="font-bold text-xl mt-1 text-red-700">{bestAsk > 0 ? fmtGRD(bestAsk) : "—"}</p>
                </div>
              </div>

              {/* Asks (Sell orders) */}
              <div className="mb-4">
                <p className="text-[11px] font-bold text-red-600 uppercase tracking-wide mb-2">Sell Orders (Ask)</p>
                {stockData.orderbook?.asks?.length > 0 ? (
                  <div className="space-y-1">
                    {stockData.orderbook.asks.map((ask: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm py-1.5 px-3 bg-red-50/50 rounded">
                        <span className="font-mono text-red-700">{fmtGRD(toGrd(ask.price))} GRD</span>
                        <span className="font-mono font-semibold">{formatNumber(ask.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Belum ada sell order</p>
                )}
              </div>

              {/* Spread */}
              <div className="text-center py-2 border-y border-border mb-4">
                <span className="text-xs text-muted-foreground">Spread: </span>
                <span className="font-mono font-bold text-sm">{bestAsk > 0 && bestBid > 0 ? fmtGRD(bestAsk - bestBid) : "—"} GRD</span>
              </div>

              {/* Bids (Buy orders) */}
              <div className="mb-6">
                <p className="text-[11px] font-bold text-green-600 uppercase tracking-wide mb-2">Buy Orders (Bid)</p>
                {stockData.orderbook?.bids?.length > 0 ? (
                  <div className="space-y-1">
                    {stockData.orderbook.bids.map((bid: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm py-1.5 px-3 bg-green-50/50 rounded">
                        <span className="font-mono text-green-700">{fmtGRD(toGrd(bid.price))} GRD</span>
                        <span className="font-mono font-semibold">{formatNumber(bid.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Belum ada buy order</p>
                )}
              </div>

              {/* Info */}
              <div className="bg-gray-50 border border-border rounded-lg p-4 text-[12px] text-muted-foreground">
                Harga saham {kode} ditentukan oleh mekanisme Order Book — pembeli dan penjual memasang order,
                transaksi terjadi saat harga bid dan ask bertemu. Settlement T+0 (instant on-chain).
              </div>
            </div>
          </div>
        )}

        {activeTab === "dividend" && (
          <DividendTab assetId={stockData.assetId} symbol={kode} />
        )}
      </div>
    </Layout>
  );
}

// ─── Dividend Tab ───
interface DividendRecord {
  txid: string;
  snapshot_height: number;
  payment_height: number;
  per_unit_grd: number;
  total_paid_grd: number;
  num_holders: number;
  record_date?: string;
  payment_date?: string;
  period?: string;
  note?: string;
}

function DividendTab({ assetId, symbol }: { assetId: string; symbol: string }) {
  const [history, setHistory] = useState<DividendRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/dividend/history/${assetId}`))
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setHistory(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

  const formatDate = (d?: string) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return d; }
  };

  return (
    <div className="space-y-6">
      {/* Dividend History */}
      <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
        <h3 className="font-bold text-[15px] mb-4">Riwayat Dividen — {symbol}</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pembayaran dividen untuk {symbol}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border text-[11px] uppercase tracking-wide">
                  <th className="py-2 px-3 font-semibold">Periode</th>
                  <th className="py-2 px-3 font-semibold">Tgl Pencatatan</th>
                  <th className="py-2 px-3 font-semibold">Tgl Pembayaran</th>
                  <th className="py-2 px-3 font-semibold text-right">Per Saham (GRD)</th>
                  <th className="py-2 px-3 font-semibold text-right">Total (GRD)</th>
                  <th className="py-2 px-3 font-semibold text-right">Pemegang</th>
                  <th className="py-2 px-3 font-semibold">Block</th>
                  <th className="py-2 px-3 font-semibold">TXID</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-gray-50">
                    <td className="py-2.5 px-3">
                      <span className="text-[11px] font-semibold bg-red-50 text-[#8B0000] border border-red-200 px-2 py-0.5 rounded">
                        {d.period || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[12px] text-muted-foreground">{formatDate(d.record_date)}</td>
                    <td className="py-2.5 px-3 text-[12px] font-medium">{formatDate(d.payment_date)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[13px] text-[#8B0000] font-semibold">{d.per_unit_grd.toFixed(8)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[13px] font-bold">{Number(d.total_paid_grd).toLocaleString("id-ID")}</td>
                    <td className="py-2.5 px-3 text-right text-[12px]">{d.num_holders}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-muted-foreground">{d.payment_height}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">
                      <Link href={`/tx/${d.txid}`} className="text-[#8B0000] hover:underline">{d.txid?.slice(0, 12)}...</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
