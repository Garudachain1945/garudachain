import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useParams, Link } from "wouter";
import { formatNumber, formatTimeAgo, truncateHash } from "@/lib/utils";
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, ArrowRight, Shield, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";

const CURRENCY_COUNTRY: Record<string, string> = {
  EUR: "EU", XAF: "CM", XOF: "SN", XPF: "PF", XCD: "AG", XDR: "UN",
  ANG: "CW", AWG: "AW", SHP: "SH", FKP: "FK", GGP: "GG", JEP: "JE",
  IMP: "IM", TVD: "TV", KID: "KI", ZWL: "ZW",
};

function currencyFlag(code: string): string | null {
  const upper = code.toUpperCase();
  const cc = CURRENCY_COUNTRY[upper] || upper.slice(0, 2);
  return [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-0.5 hover:bg-gray-100 rounded transition inline-flex">
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
    </button>
  );
}

interface OracleRate {
  symbol: string;
  grd_per_unit: number;
  units_per_grd: number;
}

interface TokenFull {
  symbol: string;
  name: string;
  type: string;
  assetId?: string;
  totalSupply: number;
  outstanding?: number;
  numHolders?: number;
  numTransfers?: number;
  issueHeight?: number;
  issueTxid?: string;
  holders?: { address: string; balance: number; percentage: number }[];
  transactions?: { txid: string; type: string; amount: number; height: number; timestamp: number; from: string; to: string }[];
}

type TabKey = "transfers" | "holders" | "info";

export function OracleCurrencyDetail() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol || "").toUpperCase();
  const flag = currencyFlag(symbol);

  const [oracleRate, setOracleRate] = useState<OracleRate | null>(null);
  const [obData, setObData] = useState<any | null>(null);
  const [allRates, setAllRates] = useState<OracleRate[]>([]);
  const [tokenInfo, setTokenInfo] = useState<TokenFull | null>(null);
  const [peggedInfo, setPeggedInfo] = useState<TokenFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("transfers");
  const [page, setPage] = useState(1);

  // Oracle page: prefer pegged token (pMYR) over direct stablecoin (MYR)
  const chainToken = peggedInfo || tokenInfo;

  useEffect(() => {
    const fetchData = () => {
      fetch(`/api/oracle/rates?symbol=${symbol}`)
        .then(r => r.json())
        .then((data: any[]) => { if (Array.isArray(data) && data.length > 0) setOracleRate(data[0]); setLoading(false); })
        .catch(() => setLoading(false));

      fetch(`/api/blockchain/stablecoins`)
        .then(r => r.json())
        .then((data: any[]) => {
          if (!Array.isArray(data)) return;
          const sc = data.find((s: any) => (s.symbol || "").toUpperCase() === symbol);
          if (sc) setObData(sc);
        })
        .catch(() => {});

      // Direct token (e.g. MYR)
      fetch(`/api/blockchain/token/${symbol}`)
        .then(r => r.json())
        .then((data: any) => { if (data && data.symbol) setTokenInfo(data); })
        .catch(() => {});

      // Pegged token (e.g. pMYR)
      fetch(`/api/blockchain/token/p${symbol}`)
        .then(r => r.json())
        .then((data: any) => { if (data && data.symbol) setPeggedInfo(data); })
        .catch(() => {});
    };
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, [symbol]);

  useEffect(() => {
    fetch(`/api/oracle/rates`)
      .then(r => r.json())
      .then((data: any[]) => { if (Array.isArray(data)) setAllRates(data); })
      .catch(() => {});
  }, []);

  const spreadColor = obData && obData.spreadPercent >= 0 ? "text-emerald-600" : "text-red-500";

  const PER_PAGE = 15;
  const tokenTxs = chainToken?.transactions ?? [];
  const pagedTxs = tokenTxs.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(tokenTxs.length / PER_PAGE));

  const tabs: { key: TabKey; label: string }[] = [
    { key: "transfers", label: "Transfer" },
    { key: "holders", label: "Pemegang" },
    { key: "info", label: "Informasi" },
  ];

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] text-white py-6">
        <div className="container mx-auto px-4">
          <Link href="/tokens" className="inline-flex items-center gap-1 text-white/70 hover:text-white text-sm mb-3">
            <ArrowLeft className="w-4 h-4" /> Kembali ke Pelacak Token
          </Link>
          <div className="flex items-center gap-4">
            {flag && <span className="text-[48px] leading-none">{flag}</span>}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{chainToken?.name ?? symbol}</h1>
                <span className="text-white/60 text-lg">({symbol})</span>
              </div>
              <p className="text-white/70 text-sm">Kurs Oracle Real-Time (Dunia Nyata)</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-white/50 animate-spin" style={{ animationDuration: "3s" }} />
              <span className="text-[12px] text-white/60">Update per 5 detik</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Memuat data oracle...</div>
        ) : !oracleRate ? (
          <div className="text-center py-12 text-muted-foreground">Mata uang "{symbol}" tidak ditemukan di oracle.</div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Pasokan Total</p>
                <p className="text-[15px] font-bold text-foreground">
                  {chainToken ? `${formatNumber(chainToken.totalSupply)} ${chainToken.symbol}` : "Belum terdaftar"}
                </p>
              </div>
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Pemegang</p>
                <p className="text-[15px] font-bold text-foreground">{chainToken?.numHolders ?? 0}</p>
              </div>
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Transfer</p>
                <p className="text-[15px] font-bold text-foreground">{chainToken?.numTransfers ?? 0}</p>
              </div>
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Asset ID</p>
                <p className="text-[13px] font-medium text-foreground font-mono truncate">{chainToken?.assetId ?? "—"}</p>
              </div>
            </div>

            {/* Oracle Price Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-border rounded-lg p-5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Harga Oracle (Dunia Nyata)</p>
                <p className="text-[22px] font-bold text-emerald-600">{oracleRate.grd_per_unit.toFixed(8)} <span className="text-[14px] text-muted-foreground">GRD</span></p>
                <p className="text-[12px] text-muted-foreground mt-1">1 GRD = {oracleRate.units_per_grd.toFixed(4)} {symbol}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] text-emerald-600 font-semibold">Live</span>
                </div>
              </div>

              <div className="bg-white border border-border rounded-lg p-5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Harga Orderbook (Pasar Blockchain)</p>
                {obData && obData.orderbookPrice > 0 ? (
                  <>
                    <p className="text-[22px] font-bold text-blue-600">{obData.orderbookPrice.toFixed(8)} <span className="text-[14px] text-muted-foreground">GRD</span></p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Ask: {obData.orderbookBestAsk.toFixed(8)} / Bid: {obData.orderbookBestBid.toFixed(8)}
                    </p>
                  </>
                ) : (
                  <p className="text-[18px] text-muted-foreground">Belum ada order</p>
                )}
              </div>

              <div className="bg-white border border-border rounded-lg p-5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Selisih (Spread)</p>
                {obData && obData.orderbookPrice > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      {obData.spreadPercent >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
                      <p className={`text-[22px] font-bold ${spreadColor}`}>
                        {obData.spreadPercent >= 0 ? "+" : ""}{obData.spreadPercent.toFixed(2)}%
                      </p>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      {obData.spreadPercent > 0 ? "Orderbook lebih mahal dari oracle" : obData.spreadPercent < 0 ? "Orderbook lebih murah dari oracle" : "Sama persis"}
                    </p>
                  </>
                ) : (
                  <p className="text-[18px] text-muted-foreground">—</p>
                )}
              </div>
            </div>

            {/* Tabs: Transfer, Pemegang, Informasi */}
            <div className="border border-border rounded-lg overflow-hidden bg-white">
              <div className="flex items-center gap-0 border-b border-border px-4 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setPage(1); }}
                    className={`px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                      activeTab === tab.key
                        ? "border-blue-600 text-blue-700 bg-blue-50/50"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Transfer Tab */}
              {activeTab === "transfers" && (
                <div>
                  <div className="flex justify-between items-center px-4 py-3">
                    <p className="text-[13px] text-foreground">
                      {chainToken ? `${formatNumber(chainToken.numTransfers ?? 0)} transaksi ${chainToken.symbol} ditemukan` : "Token belum terdaftar di blockchain"}
                    </p>
                    {chainToken && (
                      <div className="flex items-center gap-1 text-xs">
                        <button className="p-1 border border-border rounded hover:bg-gray-50 disabled:opacity-30" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-muted-foreground">Halaman {page} dari {totalPages}</span>
                        <button className="p-1 border border-border rounded hover:bg-gray-50 disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {chainToken ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                            <th className="px-3 py-2.5 text-left">Tx Hash</th>
                            <th className="px-3 py-2.5 text-left">Metode</th>
                            <th className="px-3 py-2.5 text-left">Memblokir</th>
                            <th className="px-3 py-2.5 text-left">Usia</th>
                            <th className="px-3 py-2.5 text-left">Dari</th>
                            <th className="w-6 px-1 py-2.5"></th>
                            <th className="px-3 py-2.5 text-left">Ke</th>
                            <th className="px-3 py-2.5 text-right">Jumlah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedTxs.length === 0 ? (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Tidak ada transfer ditemukan</td></tr>
                          ) : pagedTxs.map((tx) => (
                            <tr key={tx.txid} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                              <td className="px-3 py-2.5">
                                <Link href={`/tx/${tx.txid}`} className="text-primary hover:underline font-mono text-[12px]">
                                  {truncateHash(tx.txid, 10, 6)}
                                </Link>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                                  tx.type === "issuance" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : tx.type === "trade" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}>
                                  {tx.type === "issuance" ? "Issue" : tx.type === "trade" ? "Trade" : "Transfer"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <Link href={`/block/${tx.height}`} className="text-primary hover:underline font-mono text-[12px]">
                                  {tx.height}
                                </Link>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">
                                {tx.timestamp ? formatTimeAgo(new Date(tx.timestamp * 1000).toISOString()) : "—"}
                              </td>
                              <td className="px-3 py-2.5">
                                {tx.from ? (
                                  <Link href={`/address/${tx.from}`} className="text-primary hover:underline font-mono text-[12px]">
                                    {truncateHash(tx.from, 8, 6)}
                                  </Link>
                                ) : (
                                  <span className="text-emerald-600 font-semibold text-[12px]">CBDC Mint</span>
                                )}
                              </td>
                              <td className="px-1 py-2.5">
                                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                  tx.type === "issuance" ? "bg-emerald-100" : tx.type === "trade" ? "bg-blue-100" : "bg-amber-100"
                                }`}>
                                  <ArrowRight className={`w-2.5 h-2.5 ${
                                    tx.type === "issuance" ? "text-emerald-600" : tx.type === "trade" ? "text-blue-600" : "text-amber-600"
                                  }`} />
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {tx.to ? (
                                  <Link href={`/address/${tx.to}`} className="text-primary hover:underline font-mono text-[12px]">
                                    {truncateHash(tx.to, 8, 6)}
                                  </Link>
                                ) : <span className="text-muted-foreground text-[12px]">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-[12px] font-medium">
                                {formatNumber(tx.amount)} <span className="text-muted-foreground">{chainToken.symbol}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-gray-400">Token belum terdaftar di blockchain</div>
                  )}
                </div>
              )}

              {/* Holders Tab */}
              {activeTab === "holders" && (
                <div>
                  {chainToken?.holders && chainToken.holders.length > 0 ? (
                    <>
                      <div className="px-4 py-3 text-[13px] text-foreground">
                        {formatNumber(chainToken.numHolders ?? 0)} alamat memegang {chainToken.symbol}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                              <th className="px-4 py-2.5 text-left">Peringkat</th>
                              <th className="px-4 py-2.5 text-left">Alamat</th>
                              <th className="px-4 py-2.5 text-right">Saldo</th>
                              <th className="px-4 py-2.5 text-right">Persentase</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chainToken.holders.map((h, idx) => (
                              <tr key={h.address} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                                <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <Link href={`/address/${h.address}`} className="text-primary hover:underline font-mono text-[12px]">
                                      {truncateHash(h.address, 12, 8)}
                                    </Link>
                                    <CopyBtn text={h.address} />
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-medium text-[12px]">
                                  {formatNumber(h.balance)} <span className="text-muted-foreground">{chainToken.symbol}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(100, h.percentage)}%` }} />
                                    </div>
                                    <span className="text-[12px] font-medium text-muted-foreground w-12 text-right">{h.percentage}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="px-4 py-8 text-center text-gray-400">
                      {chainToken ? "Tidak ada pemegang ditemukan" : "Token belum terdaftar di blockchain"}
                    </div>
                  )}
                </div>
              )}

              {/* Info Tab */}
              {activeTab === "info" && (
                <div className="p-6">
                  <div className="max-w-3xl space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                        <div>
                          <h3 className="font-bold text-foreground mb-2">{symbol} — Stablecoin Oracle GarudaChain</h3>
                          <p className="text-[13px] text-muted-foreground leading-relaxed">
                            Kurs <strong>1 {symbol} = {oracleRate ? `${oracleRate.grd_per_unit.toFixed(8)} GRD` : "..."}</strong> diperbarui
                            secara real-time setiap detik oleh sistem oracle menggunakan konsensus median dari 3 sumber data.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: "Mata Uang", value: symbol },
                        { label: "Nama", value: chainToken?.name ?? symbol },
                        { label: "Jenis", value: "Stablecoin Oracle (Dunia Nyata)" },
                        { label: "Mekanisme Harga", value: "Oracle Real-Time (Median 3 Sumber)" },
                        { label: "Kurs Oracle", value: oracleRate ? `1 ${symbol} = ${oracleRate.grd_per_unit.toFixed(8)} GRD` : "Memuat..." },
                        { label: "Kurs Balik", value: oracleRate ? `1 GRD = ${oracleRate.units_per_grd.toFixed(4)} ${symbol}` : "Memuat..." },
                        { label: "Frekuensi Update", value: "Per detik (real-time)" },
                        { label: "Blockchain", value: "Jaringan Utama GarudaChain" },
                        ...(chainToken ? [
                          { label: "Simbol Token", value: chainToken.symbol },
                          { label: "Tipe Token", value: chainToken.type },
                          { label: "Pasokan Total", value: `${formatNumber(chainToken.totalSupply)} ${chainToken.symbol}` },
                          { label: "Asset ID", value: chainToken.assetId ?? "—" },
                          { label: "Blok Penerbitan", value: `#${formatNumber(chainToken.issueHeight ?? 0)}` },
                        ] : []),
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white border border-border rounded-lg p-4">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{label}</p>
                          <p className="text-[14px] font-medium text-foreground break-all">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Cross rates */}
                    <div className="bg-white border border-border rounded-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-border bg-gray-50/80">
                        <p className="text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                          Perbandingan Kurs Terdekat
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-gray-50/50 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                              <th className="px-4 py-3 text-left">Mata Uang</th>
                              <th className="px-4 py-3 text-right">Harga Oracle (GRD)</th>
                              <th className="px-4 py-3 text-right">Rasio ke {symbol}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const sorted = [...allRates]
                                .filter(r => currencyFlag(r.symbol) !== null && r.symbol.toUpperCase() !== symbol)
                                .sort((a, b) => Math.abs(a.grd_per_unit - oracleRate.grd_per_unit) - Math.abs(b.grd_per_unit - oracleRate.grd_per_unit))
                                .slice(0, 10);
                              return sorted.map(r => {
                                const ratio = r.grd_per_unit / oracleRate.grd_per_unit;
                                const rFlag = currencyFlag(r.symbol);
                                return (
                                  <tr key={r.symbol} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                                    <td className="px-4 py-3">
                                      <Link href={`/oracle/${r.symbol}`} className="flex items-center gap-2 text-primary hover:underline">
                                        {rFlag && <span className="text-[18px]">{rFlag}</span>}
                                        <span className="font-semibold text-[13px]">{r.symbol}</span>
                                      </Link>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-[12px] text-emerald-600 font-semibold">
                                      {r.grd_per_unit.toFixed(8)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-[12px] text-foreground font-medium">
                                      1 {symbol} = {ratio.toFixed(4)} {r.symbol}
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
