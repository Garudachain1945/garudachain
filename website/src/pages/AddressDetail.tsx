import { Layout } from "@/components/Layout";
import { useParams, Link } from "wouter";
import { formatTimeAgo, truncateHash, formatNumber } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";

interface AddressData {
  address: string;
  balance: string;
  transactionCount: number;
  firstSeen: string;
  lastSeen: string;
  transactions: { hash: string; blockNumber: number; timestamp: string; from: string; to: string; value: string; fee: string; status: string; method?: string }[];
  portfolio: { asset_id: string; symbol: string; type: string; balance: number }[];
}

type TabKey = "transactions" | "holdings";

export function AddressDetail() {
  const params = useParams<{ address: string }>();
  const address = params.address || "";
  const [info, setInfo] = useState<AddressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("transactions");

  useEffect(() => {
    if (!address) return;
    setIsLoading(true);
    setIsError(false);
    setInfo(null);
    fetch(`/api/blockchain/address/${address}`)
      .then(r => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setInfo(data);
        setIsLoading(false);
      })
      .catch(() => { setIsError(true); setIsLoading(false); });
  }, [address]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-xl font-bold mb-1">Address</h1>
            <p className="text-white/70 text-sm">Memuat data address...</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-20 flex justify-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (isError || !info) {
    return (
      <Layout>
        <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-xl font-bold mb-1">Address Not Found</h1>
            <p className="text-white/70 text-sm">Address tidak ditemukan di GarudaChain</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Address tersebut tidak ditemukan atau belum memiliki transaksi.</p>
          <Link href="/" className="text-primary hover:underline text-sm mt-4 inline-block">
            Kembali ke Beranda
          </Link>
        </div>
      </Layout>
    );
  }

  const txList = info.transactions || [];
  const portfolio = info.portfolio || [];

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold mb-1">Address</h1>
          <div className="flex items-center gap-2">
            <p className="text-white/80 text-sm font-mono break-all">{address}</p>
            <button
              onClick={copyToClipboard}
              className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              title="Copy address"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4 text-white/60" />}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Overview Cards - Etherscan style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border rounded-lg overflow-hidden mb-6 bg-white">
          {/* Overview */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">Overview</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">GRD Balance</p>
                <p className="text-[15px] font-bold text-foreground">
                  {info.balance} <span className="text-[13px] text-muted-foreground font-normal">GRD</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Token Holdings</p>
                <p className="text-[15px] font-bold text-foreground">
                  {portfolio.length > 0 ? `${portfolio.length} Token${portfolio.length > 1 ? "s" : ""}` : "0 Tokens"}
                </p>
              </div>
            </div>
          </div>

          {/* More Info */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">More Info</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Transactions</p>
                <p className="text-[15px] font-bold text-foreground">{formatNumber(info.transactionCount)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Pertama Terlihat</p>
                <p className="text-[13px] font-medium text-foreground">
                  {info.firstSeen ? new Date(info.firstSeen).toLocaleDateString("id-ID") : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Token Holdings Summary */}
          <div className="p-5">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-4">Token Portfolio</h3>
            <div className="space-y-2">
              {portfolio.length > 0 ? portfolio.map((p) => (
                <div key={p.asset_id} className="flex items-center justify-between">
                  <Link href={`/token/${p.symbol}`} className="text-primary hover:underline text-[13px] font-medium">
                    {p.symbol}
                  </Link>
                  <span className="text-[13px] font-bold text-foreground">{formatNumber(p.balance)}</span>
                </div>
              )) : (
                <p className="text-[13px] text-muted-foreground">Tidak ada token</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-0 border-b border-border px-4">
            {([
              { key: "transactions" as TabKey, label: "Transactions" },
              { key: "holdings" as TabKey, label: "Token Holdings" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? "border-primary text-primary bg-red-50/50"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                }`}
              >
                {tab.label}
                {tab.key === "holdings" && portfolio.length > 0 && (
                  <span className="ml-1.5 text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{portfolio.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Transactions Tab */}
          {activeTab === "transactions" && (
            <div>
              <div className="px-4 py-3 text-[13px] text-foreground">
                Latest {txList.length} transactions
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                      <th className="px-3 py-2.5 text-left">Tx Hash</th>
                      <th className="px-3 py-2.5 text-left">Method</th>
                      <th className="px-3 py-2.5 text-left">Block</th>
                      <th className="px-3 py-2.5 text-left">Age</th>
                      <th className="px-3 py-2.5 text-left">From</th>
                      <th className="w-6 px-1 py-2.5"></th>
                      <th className="px-3 py-2.5 text-left">To</th>
                      <th className="px-3 py-2.5 text-right">Value</th>
                      <th className="px-3 py-2.5 text-right">Txn Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txList.length > 0 ? (
                      txList.map((tx) => {
                        const isOut = tx.from?.toLowerCase() === address.toLowerCase();
                        return (
                          <tr key={`${tx.hash}-${tx.method}`} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                            <td className="px-3 py-2.5">
                              <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline font-mono text-[12px]">
                                {truncateHash(tx.hash, 10, 6)}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                                tx.method === "Trade" ? "bg-blue-50 text-blue-700 border-blue-200"
                                : tx.method === "Issue" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {tx.method || "Transfer"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <Link href={`/block/${tx.blockNumber}`} className="text-primary hover:underline font-mono text-[12px]">
                                {tx.blockNumber}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-[12px]">
                              {formatTimeAgo(tx.timestamp)}
                            </td>
                            <td className="px-3 py-2.5">
                              {tx.from === "coinbase" ? (
                                <span className="text-amber-600 font-semibold text-[12px]">Coinbase</span>
                              ) : tx.from ? (
                                <Link href={`/address/${tx.from}`} className="text-primary hover:underline font-mono text-[12px]">
                                  {truncateHash(tx.from, 6, 4)}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground text-[12px]">—</span>
                              )}
                            </td>
                            <td className="px-1 py-2.5">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                isOut ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {isOut ? "OUT" : "IN"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              {tx.to ? (
                                <Link href={`/address/${tx.to}`} className="text-primary hover:underline font-mono text-[12px]">
                                  {truncateHash(tx.to, 6, 4)}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground text-[12px]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-[12px] font-medium whitespace-nowrap">
                              {tx.value}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                              {tx.fee}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          Tidak ada transaksi untuk address ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Token Holdings Tab */}
          {activeTab === "holdings" && (
            <div>
              <div className="px-4 py-3 text-[13px] text-foreground">
                {portfolio.length} token{portfolio.length !== 1 ? "s" : ""} dimiliki oleh address ini
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left">#</th>
                      <th className="px-4 py-2.5 text-left">Token</th>
                      <th className="px-4 py-2.5 text-left">Type</th>
                      <th className="px-4 py-2.5 text-right">Balance</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.length > 0 ? portfolio.map((p, idx) => (
                      <tr key={p.asset_id} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <Link href={`/token/${p.symbol}`} className="text-primary hover:underline font-medium text-[13px]">
                            {p.symbol}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                            p.type === "STABLECOIN" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : p.type === "SAHAM" ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-gray-50 text-gray-700 border-gray-200"
                          }`}>
                            {p.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] font-bold">
                          {formatNumber(p.balance)} <span className="text-muted-foreground font-normal">{p.symbol}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.type === "SAHAM" ? (
                            <Link href={`/saham/${p.symbol}`} className="text-[11px] px-3 py-1 rounded border border-primary text-primary hover:bg-primary hover:text-white transition-colors font-medium">
                              Detail
                            </Link>
                          ) : (
                            <Link href={`/token/${p.symbol}`} className="text-[11px] px-3 py-1 rounded border border-border text-foreground hover:bg-gray-50 transition-colors font-medium">
                              Detail
                            </Link>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          Address ini tidak memiliki token.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
