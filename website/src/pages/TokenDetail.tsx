import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useParams, Link } from "wouter";
import { AssetLogo } from "@/components/AssetLogo";
import { useGetNetworkStats, useGetLatestTransactions, useGetLatestBlocks } from "@workspace/api-client-react";
import { formatTimeAgo, truncateHash, formatNumber } from "@/lib/utils";
import { ArrowRight, ChevronLeft, ChevronRight, Shield, Copy, Check } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";

type TabKey = "transfers" | "holders" | "info" | "blocks" | "analytics";

interface TokenInfo {
  symbol: string;
  name: string;
  type: string;
  assetId?: string;
  totalSupply: number;
  outstanding?: number;
  price?: string | null;
  priceStable?: boolean;
  issueHeight?: number;
  issueTxid?: string;
  numHolders?: number;
  numTransfers?: number;
  holders?: { address: string; balance: number; percentage: number }[];
  transactions?: { txid: string; type: string; amount: number; height: number; timestamp: number; from: string; to: string }[];
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

export function TokenDetail() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol || "GRD").toUpperCase();
  const [activeTab, setActiveTab] = useState<TabKey>("transfers");
  const [page, setPage] = useState(1);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  const isNative = symbol === "GRD";
  const isStablecoin = tokenInfo?.priceStable === true || tokenInfo?.type === "Stablecoin";
  const [oracleRate, setOracleRate] = useState<{ grd_per_unit: number; units_per_grd: number; source: string } | null>(null);
  const [obData, setObData] = useState<{ orderbookPrice: number; bestAsk: number; bestBid: number; spread: number } | null>(null);

  // Fetch real-time oracle rate + orderbook for stablecoins (every 5s)
  useEffect(() => {
    if (!isStablecoin || isNative) return;
    const fetchRate = () => {
      fetch(`/api/oracle/rates?symbol=${symbol}`)
        .then(r => r.json())
        .then((data: any[]) => {
          if (Array.isArray(data) && data.length > 0) setOracleRate(data[0]);
        })
        .catch(() => {});
      fetch(`/api/blockchain/stablecoins`)
        .then(r => r.json())
        .then((data: any[]) => {
          const sc = data.find((s: any) => (s.symbol || "").toUpperCase() === symbol);
          if (sc) {
            setObData({
              orderbookPrice: sc.orderbookPrice || 0,
              bestAsk: sc.orderbookBestAsk || 0,
              bestBid: sc.orderbookBestBid || 0,
              spread: sc.spreadPercent || 0,
            });
          }
        })
        .catch(() => {});
    };
    fetchRate();
    const iv = setInterval(fetchRate, 5000);
    return () => clearInterval(iv);
  }, [symbol, isStablecoin, isNative]);

  const { data: stats, isLoading: statsLoading } = useGetNetworkStats({
    query: { refetchInterval: 10000 },
  });

  const { data: txs, isLoading: txsLoading } = useGetLatestTransactions(
    { limit: 20 },
    { query: { refetchInterval: 12000, enabled: isNative } },
  );

  const { data: blocks, isLoading: blocksLoading } = useGetLatestBlocks(
    { limit: 10 },
    { query: { refetchInterval: 12000, enabled: isNative } },
  );

  useEffect(() => {
    setTokenLoading(true);
    fetch(`/api/blockchain/token/${symbol}`)
      .then(r => r.json())
      .then(data => { setTokenInfo(data); setTokenLoading(false); })
      .catch(() => setTokenLoading(false));

    const interval = setInterval(() => {
      fetch(`/api/blockchain/token/${symbol}`)
        .then(r => r.json())
        .then(setTokenInfo)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [symbol]);

  useEffect(() => {
    if (!isNative && activeTab === "blocks") setActiveTab("transfers");
    if (!isNative && activeTab === "analytics") setActiveTab("transfers");
  }, [isNative, activeTab]);

  const totalSupply = isNative ? (stats?.latestBlock ?? 0) * 0.01 : tokenInfo?.totalSupply ?? 0;
  const apbnReserve = isNative ? Math.floor(totalSupply * 0.01) : 0;

  const PER_PAGE = 15;
  const tokenTxs = tokenInfo?.transactions ?? [];
  const pagedTxs = tokenTxs.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(tokenTxs.length / PER_PAGE));

  const tabs: { key: TabKey; label: string }[] = isNative
    ? [
        { key: "transfers", label: "Transfers" },
        { key: "blocks", label: "Blok Terbaru" },
        { key: "holders", label: "Info Token" },
        { key: "info", label: "Info" },
        { key: "analytics", label: "Analytics" },
      ]
    : [
        { key: "transfers", label: "Transfers" },
        { key: "holders", label: "Holders" },
        { key: "info", label: "Info" },
      ];

  if (tokenLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center text-gray-400">Loading token data...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Token Header - like Etherscan */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <AssetLogo symbol={symbol} size={40} tipe={isStablecoin ? "STABLECOIN" : "SAHAM"} />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground text-sm font-medium">Token</span>
              <h1 className="text-xl font-bold text-foreground">{tokenInfo?.name ?? symbol}</h1>
              <span className="text-muted-foreground text-sm">({symbol})</span>
              <VerifiedBadge
                type={isNative ? "NATIVE" : isStablecoin ? "STABLECOIN" : "SAHAM"}
                transfers={tokenInfo?.numTransfers ?? 0}
                size={20}
                className="ml-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isStablecoin ? (
              <>
                <span className="text-[11px] border border-emerald-200 px-2 py-0.5 rounded text-emerald-700 bg-emerald-50 font-bold">Stablecoin</span>
                <span className="text-[11px] border border-border px-2 py-0.5 rounded text-muted-foreground bg-gray-50 font-medium">Pegged IDR</span>
                <span className="text-[11px] border border-border px-2 py-0.5 rounded text-muted-foreground bg-gray-50 font-medium">GRC-20</span>
              </>
            ) : isNative ? (
              <>
                <span className="text-[11px] border border-red-200 px-2 py-0.5 rounded text-red-700 bg-red-50 font-bold">Native</span>
                <span className="text-[11px] border border-border px-2 py-0.5 rounded text-muted-foreground bg-gray-50 font-medium">Native Coin</span>
                <span className="text-[11px] border border-border px-2 py-0.5 rounded text-muted-foreground bg-gray-50 font-medium">Bitcoin Core v28</span>
              </>
            ) : (
              <span className="text-[11px] border border-blue-200 px-2 py-0.5 rounded text-blue-700 bg-blue-50 font-bold">{tokenInfo?.type ?? "Token"}</span>
            )}
          </div>
        </div>

        {/* Three info panels - Etherscan style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border rounded-lg overflow-hidden mb-6 bg-white">
          {/* Overview */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">Overview</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Max Total Supply</p>
                <p className="text-[15px] font-bold text-foreground">
                  {formatNumber(totalSupply)} {symbol}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Holders</p>
                <p className="text-[15px] font-bold text-foreground">
                  {isNative ? formatNumber(stats?.totalAddresses || Math.max(1, (stats?.latestBlock ?? 0) / 100))
                    : formatNumber(tokenInfo?.numHolders ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Transfers</p>
                <p className="text-[15px] font-bold text-foreground">
                  {isNative ? formatNumber(stats?.totalTransactions ?? 0)
                    : formatNumber(tokenInfo?.numTransfers ?? 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Market / Price */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              {isStablecoin ? "Kurs Oracle (Live)" : isNative ? "Jaringan" : "Market"}
            </h3>
            <div className="space-y-4">
              {isStablecoin ? (
                <>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Harga Oracle (Dunia Nyata)</p>
                    <p className="text-[18px] font-bold text-foreground">
                      {oracleRate ? `${oracleRate.grd_per_unit.toFixed(8)} GRD` : "Memuat..."}{" "}
                      <span className="text-[12px] text-emerald-600 font-medium">per 1 {symbol}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Harga Orderbook (Pasar Blockchain)</p>
                    <p className="text-[15px] font-bold text-foreground">
                      {obData && obData.orderbookPrice > 0 ? `${obData.orderbookPrice.toFixed(8)} GRD` : "Tidak ada order"}
                    </p>
                    {obData && obData.bestAsk > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Ask: {obData.bestAsk.toFixed(8)} / Bid: {obData.bestBid.toFixed(8)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Selisih (Spread)</p>
                    {obData && obData.orderbookPrice > 0 ? (
                      <p className={`text-[15px] font-bold ${obData.spread >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {obData.spread >= 0 ? "+" : ""}{obData.spread.toFixed(2)}%
                        <span className="text-[11px] text-muted-foreground font-normal ml-1">
                          {obData.spread < 0 ? "(Orderbook lebih murah)" : "(Orderbook lebih mahal)"}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">—</p>
                    )}
                  </div>
                </>
              ) : isNative ? (
                <>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Network</p>
                    <p className="text-[15px] font-bold text-foreground">{stats?.networkName ?? "GarudaChain"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Avg Block Time</p>
                    <p className="text-[15px] font-bold text-foreground">{stats?.avgBlockTime ?? 60}s</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Node Connections</p>
                    <p className="text-[15px] font-bold text-foreground">{stats?.validators ?? 0} peers</p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Type</p>
                  <p className="text-[15px] font-bold text-foreground">{tokenInfo?.type ?? "Token"}</p>
                </div>
              )}
            </div>
          </div>

          {/* Other Info */}
          <div className="p-5">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">Other Info</h3>
            <div className="space-y-4">
              {isStablecoin || !isNative ? (
                <>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Asset ID</p>
                    <div className="flex items-center gap-1">
                      <p className="text-[12px] font-mono text-primary break-all">
                        {tokenInfo?.assetId ? truncateHash(tokenInfo.assetId, 16, 8) : "—"}
                      </p>
                      {tokenInfo?.assetId && <CopyBtn text={tokenInfo.assetId} />}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Issue Transaction</p>
                    <div className="flex items-center gap-1">
                      {tokenInfo?.issueTxid ? (
                        <>
                          <Link href={`/tx/${tokenInfo.issueTxid}`} className="text-[12px] font-mono text-primary hover:underline">
                            {truncateHash(tokenInfo.issueTxid, 12, 8)}
                          </Link>
                          <CopyBtn text={tokenInfo.issueTxid} />
                        </>
                      ) : <span className="text-muted-foreground text-[12px]">—</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Issue Block</p>
                    <Link href={`/block/${tokenInfo?.issueHeight ?? 0}`} className="text-[15px] font-bold text-primary hover:underline">
                      #{formatNumber(tokenInfo?.issueHeight ?? 0)}
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Block Reward</p>
                    <p className="text-[15px] font-bold text-foreground">0.01 GRD / blok</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">APBN Reserve (1%)</p>
                    <p className="text-[15px] font-bold text-foreground">{formatNumber(apbnReserve)} GRD</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Signature</p>
                    <p className="text-[13px] font-medium text-foreground">5-Layer MuSig2 Schnorr</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs - like Etherscan */}
        <div className="border border-border rounded-lg overflow-hidden bg-white">
          <div className="flex items-center gap-0 border-b border-border px-4 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setPage(1); }}
                className={`px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? isStablecoin ? "border-emerald-600 text-emerald-700 bg-emerald-50/50" : "border-primary text-primary bg-red-50/50"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Transfers Tab */}
          {activeTab === "transfers" && (
            <div>
              <div className="flex justify-between items-center px-4 py-3">
                <p className="text-[13px] text-foreground">
                  {isNative
                    ? "Transaksi GRD terbaru dari blockchain"
                    : `${formatNumber(tokenInfo?.numTransfers ?? 0)} transaksi ${symbol} ditemukan`}
                </p>
                <div className="flex items-center gap-1 text-xs">
                  <button className="p-1 border border-border rounded hover:bg-gray-50 disabled:opacity-30" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-muted-foreground">Page {page} of {isNative ? "..." : totalPages}</span>
                  <button className="p-1 border border-border rounded hover:bg-gray-50 disabled:opacity-30" disabled={!isNative && page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                      <th className="px-3 py-2.5 text-left">Tx Hash</th>
                      {!isNative && <th className="px-3 py-2.5 text-left">Method</th>}
                      <th className="px-3 py-2.5 text-left">Block</th>
                      <th className="px-3 py-2.5 text-left">Age</th>
                      <th className="px-3 py-2.5 text-left">From</th>
                      <th className="w-6 px-1 py-2.5"></th>
                      <th className="px-3 py-2.5 text-left">To</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isNative ? (
                      // GRD native transactions
                      txsLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/50 animate-pulse">
                            {Array.from({ length: 7 }).map((_, j) => (
                              <td key={j} className="px-3 py-2.5"><div className="h-3.5 bg-gray-100 rounded w-16" /></td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        (txs && Array.isArray(txs) ? txs : []).map((tx) => (
                          <tr key={tx.hash} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                            <td className="px-3 py-2.5">
                              <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline font-mono text-[12px]">
                                {truncateHash(tx.hash, 10, 6)}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">
                              <Link href={`/block/${tx.blockNumber}`} className="text-primary hover:underline font-mono text-[12px]">
                                {tx.blockNumber}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">{formatTimeAgo(tx.timestamp)}</td>
                            <td className="px-3 py-2.5">
                              <span className="font-mono text-[12px]">
                                {tx.from === "coinbase" || tx.from?.includes("Coinbase") ? (
                                  <span className="text-amber-600 font-semibold">Coinbase</span>
                                ) : (
                                  <Link href={`/address/${tx.from}`} className="text-primary hover:underline">{truncateHash(tx.from, 8, 6)}</Link>
                                )}
                              </span>
                            </td>
                            <td className="px-1 py-2.5">
                              <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
                                <ArrowRight className="w-2.5 h-2.5 text-emerald-600" />
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {tx.to ? (
                                <Link href={`/address/${tx.to}`} className="text-primary hover:underline font-mono text-[12px]">{truncateHash(tx.to, 8, 6)}</Link>
                              ) : <span className="text-muted-foreground text-[12px]">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-[12px] font-medium">{tx.value}</td>
                          </tr>
                        ))
                      )
                    ) : (
                      // Token transfers (IDR-T etc)
                      pagedTxs.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No transfers found</td></tr>
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
                            {formatNumber(tx.amount)} <span className="text-muted-foreground">{symbol}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Holders Tab */}
          {activeTab === "holders" && (
            <div>
              {!isNative && tokenInfo?.holders && tokenInfo.holders.length > 0 ? (
                <>
                  <div className="px-4 py-3 text-[13px] text-foreground">
                    {formatNumber(tokenInfo?.numHolders ?? 0)} addresses hold {symbol}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                          <th className="px-4 py-2.5 text-left">Rank</th>
                          <th className="px-4 py-2.5 text-left">Address</th>
                          <th className="px-4 py-2.5 text-right">Balance</th>
                          <th className="px-4 py-2.5 text-right">Percentage</th>
                          <th className="px-4 py-2.5 text-right">Value (IDR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenInfo.holders.map((h, idx) => (
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
                              {formatNumber(h.balance)} <span className="text-muted-foreground">{symbol}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full ${isStablecoin ? "bg-emerald-500" : "bg-primary"}`}
                                    style={{ width: `${Math.min(100, h.percentage)}%` }} />
                                </div>
                                <span className="text-[12px] font-medium text-muted-foreground w-12 text-right">{h.percentage}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                              {isStablecoin ? `Rp ${formatNumber(h.balance)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : isNative ? (
                // GRD Token Info
                <div className="p-6">
                  <div className="max-w-3xl space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: "Block Reward", value: "0.01 GRD per blok" },
                        { label: "APBN Allocation", value: "8% (0.0008 GRD per blok)" },
                        { label: "Consensus", value: "Proof of Work (SHA-256d)" },
                        { label: "Base", value: "Bitcoin Core v28.1 Fork" },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white border border-border rounded-lg p-4">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{label}</p>
                          <p className="text-[14px] font-medium text-foreground">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-gray-400">No holders found</div>
              )}
            </div>
          )}

          {/* Info Tab */}
          {activeTab === "info" && (
            <div className="p-6">
              {isStablecoin ? (
                <div className="max-w-3xl space-y-6">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <h3 className="font-bold text-foreground mb-2">{symbol} — Stablecoin Resmi GarudaChain</h3>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">
                          Kurs <strong>1 {symbol} = {oracleRate ? `${oracleRate.grd_per_unit.toFixed(8)} GRD` : "..."}</strong> diperbarui
                          secara real-time setiap detik oleh sistem oracle.
                          Token ini digunakan sebagai medium pembayaran digital yang stabil di ekosistem GarudaChain.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: "Nama Token", value: tokenInfo?.name ?? symbol },
                      { label: "Simbol", value: symbol },
                      { label: "Jenis Token", value: "Stablecoin (GRC-20)" },
                      { label: "Mekanisme Harga", value: "Oracle Real-Time" },
                      { label: "Kurs Oracle", value: oracleRate ? `1 ${symbol} = ${oracleRate.grd_per_unit.toFixed(8)} GRD` : "Memuat..." },
                      { label: "Kurs Balik", value: oracleRate ? `1 GRD = ${oracleRate.units_per_grd.toFixed(4)} ${symbol}` : "Memuat..." },
                      { label: "Penerbit", value: "Otoritas CBDC" },
                      { label: "Blockchain", value: "Jaringan Utama GarudaChain" },
                      { label: "Asset ID", value: tokenInfo?.assetId ?? "—" },
                      { label: "Blok Penerbitan", value: `#${formatNumber(tokenInfo?.issueHeight ?? 0)}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white border border-border rounded-lg p-4">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{label}</p>
                        <p className="text-[14px] font-medium text-foreground break-all">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                  {[
                    { label: "Nama Token", value: tokenInfo?.name ?? symbol },
                    { label: "Symbol", value: symbol },
                    { label: "Tipe", value: isNative ? "Native Token" : tokenInfo?.type ?? "Token" },
                    { label: "Blockchain", value: stats?.networkName ?? "GarudaChain Mainnet" },
                    ...(isNative ? [
                      { label: "Block Reward", value: "0.01 GRD" },
                      { label: "Signature", value: "5-Layer MuSig2 Schnorr" },
                      { label: "Total Supply", value: `${formatNumber(totalSupply)} GRD` },
                      { label: "APBN Reserve", value: `${formatNumber(apbnReserve)} GRD` },
                    ] : [
                      { label: "Asset ID", value: tokenInfo?.assetId ?? "—" },
                      { label: "Total Supply", value: `${formatNumber(totalSupply)} ${symbol}` },
                    ]),
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{label}</p>
                      <p className="text-[14px] font-medium text-foreground break-all">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Blocks Tab (GRD only) */}
          {activeTab === "blocks" && isNative && (
            <div>
              <div className="px-4 py-3 text-[13px] text-foreground">Blok terbaru di GarudaChain</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left">Block</th>
                      <th className="px-4 py-2.5 text-left">Hash</th>
                      <th className="px-4 py-2.5 text-left">Umur</th>
                      <th className="px-4 py-2.5 text-right">Txns</th>
                      <th className="px-4 py-2.5 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocksLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50 animate-pulse">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="px-4 py-2.5"><div className="h-3.5 bg-gray-100 rounded w-16" /></td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      (blocks && Array.isArray(blocks) ? blocks : []).map((b) => (
                        <tr key={b.hash} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <Link href={`/block/${b.number}`} className="text-primary hover:underline font-mono text-[13px] font-bold">{b.number}</Link>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{truncateHash(b.hash, 12, 6)}</td>
                          <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{formatTimeAgo(b.timestamp)}</td>
                          <td className="px-4 py-2.5 text-right text-[12px]">
                            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[11px] font-semibold">{b.transactionCount} txn</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">{b.size.toLocaleString()} B</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Analytics Tab (GRD only) */}
          {activeTab === "analytics" && isNative && (
            <div className="p-6">
              <div className="max-w-3xl space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total Supply", value: statsLoading ? "..." : `${formatNumber(totalSupply)} GRD` },
                    { label: "Block Height", value: statsLoading ? "..." : formatNumber(stats?.latestBlock ?? 0) },
                    { label: "Total Tx", value: statsLoading ? "..." : formatNumber(stats?.totalTransactions ?? 0) },
                    { label: "TPS", value: statsLoading ? "..." : `${(stats?.tps ?? 0).toFixed(1)} tx/s` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 border border-border rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{label}</p>
                      <p className="text-[15px] font-bold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-border rounded-lg p-4">
                    <h4 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Supply Breakdown</h4>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-[12px] mb-1">
                          <span className="text-muted-foreground">Miner Rewards (99%)</span>
                          <span className="font-medium">{formatNumber(Math.floor(totalSupply * 0.99))} GRD</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full" style={{ width: "99%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[12px] mb-1">
                          <span className="text-muted-foreground">APBN Reserve (1%)</span>
                          <span className="font-medium text-amber-600">{formatNumber(apbnReserve)} GRD</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-amber-500 h-2 rounded-full" style={{ width: "1%" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-border rounded-lg p-4">
                    <h4 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Network Performance</h4>
                    <div className="space-y-3">
                      {[
                        { l: "Avg Block Time", v: `${(stats?.avgBlockTime ?? 0).toFixed(1)}s` },
                        { l: "TPS", v: `${(stats?.tps ?? 0).toFixed(1)} tx/s` },
                        { l: "Peers", v: `${stats?.validators ?? 0}` },
                        { l: "Reward/Block", v: "0.01 GRD" },
                      ].map(({ l, v }) => (
                        <div key={l} className="flex justify-between">
                          <span className="text-[12px] text-muted-foreground">{l}</span>
                          <span className="text-[12px] font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
