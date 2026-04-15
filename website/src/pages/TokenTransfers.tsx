import { Layout } from "@/components/Layout";
import { useGetLatestTransactions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatTimeAgo, truncateHash } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export function TokenTransfers() {
  const { data: txs, isLoading } = useGetLatestTransactions(
    { limit: 25 },
    { query: { refetchInterval: 10000 } },
  );

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold mb-1">Transfer Token GRD</h1>
          <p className="text-white/70 text-sm">Riwayat semua transfer GRD di GarudaChain Mainnet</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80 text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">Tx Hash</th>
                  <th className="px-3 py-3 text-left">Block</th>
                  <th className="px-3 py-3 text-left text-primary">Umur</th>
                  <th className="px-3 py-3 text-left">Dari</th>
                  <th className="w-6 px-1 py-3"></th>
                  <th className="px-3 py-3 text-left">Ke</th>
                  <th className="px-3 py-3 text-right text-primary">Nilai</th>
                  <th className="px-3 py-3 text-left">Token</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50 animate-pulse">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                        ))}
                      </tr>
                    ))
                  : (txs && Array.isArray(txs) ? txs : []).map((tx) => (
                      <tr key={tx.hash} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-3 py-3">
                          <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline font-mono text-[12px]">
                            {truncateHash(tx.hash, 10, 6)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/block/${tx.blockNumber}`} className="text-primary hover:underline font-mono text-[12px]">
                            {tx.blockNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap text-[12px]">
                          {formatTimeAgo(tx.timestamp)}
                        </td>
                        <td className="px-3 py-3">
                          {tx.from === "coinbase" ? (
                            <span className="text-amber-600 font-semibold text-[12px]">⛏ Coinbase</span>
                          ) : (
                            <Link href={`/address/${tx.from}`} className="text-primary hover:underline font-mono text-[12px]">
                              {truncateHash(tx.from, 6, 4)}
                            </Link>
                          )}
                        </td>
                        <td className="px-1 py-3">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                            <ArrowRight className="w-3 h-3 text-emerald-600" />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {tx.to ? (
                            <Link href={`/address/${tx.to}`} className="text-primary hover:underline font-mono text-[12px]">
                              {truncateHash(tx.to, 6, 4)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-[12px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] font-medium">{tx.value}</td>
                        <td className="px-3 py-3">
                          <Link href="/token/GRD" className="text-primary hover:underline text-[12px] flex items-center gap-1">
                            <img src="/garuda.svg" alt="" className="w-4 h-4" />
                            GRD
                          </Link>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
