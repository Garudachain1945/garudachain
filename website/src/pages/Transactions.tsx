import { Layout } from "@/components/Layout";
import { useGetLatestTransactions, useGetNetworkStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatTimeAgo, truncateHash, formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ArrowRight } from "lucide-react";
import { useBlockStream } from "@/hooks/use-block-stream";

export function Transactions() {
  const { t } = useI18n();
  useBlockStream();
  const { data: txs, isLoading } = useGetLatestTransactions(
    { limit: 50 },
    {},
  );
  const { data: stats } = useGetNetworkStats({});

  const txList = txs && Array.isArray(txs) ? txs : [];

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold mb-1">{t("txs.title")}</h1>
          <p className="text-white/70 text-sm">{t("txs.subtitle")}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.total_transactions")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? formatNumber(stats.totalTransactions) : "..."}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.block_height")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? formatNumber(stats.latestBlock) : "..."}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.tps")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? stats.tps.toFixed(1) : "..."}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.avg_block_time")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? `${stats.avgBlockTime.toFixed(1)}s` : "..."}
            </p>
          </div>
        </div>

        {/* Table header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">
            Total{" "}
            <span className="text-primary">{stats ? formatNumber(stats.totalTransactions) : "..."}</span>{" "}
            {t("txs.found")}
          </p>
          <p className="text-xs text-muted-foreground">({t("txs.showing_latest")})</p>
        </div>

        {/* Transactions table */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80 text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">{t("txs.hash")}</th>
                  <th className="px-3 py-3 text-left text-primary">{t("txs.block")}</th>
                  <th className="px-3 py-3 text-left text-primary">{t("common.time")}</th>
                  <th className="px-3 py-3 text-left">{t("common.from")}</th>
                  <th className="w-6 px-1 py-3"></th>
                  <th className="px-3 py-3 text-left">{t("common.to")}</th>
                  <th className="px-3 py-3 text-right text-primary">{t("common.value")}</th>
                  <th className="px-3 py-3 text-right">{t("common.fee")}</th>
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
                  : txList.map((tx) => (
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
                            <span className="text-amber-600 font-semibold text-[12px]">Coinbase (Mining)</span>
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
                        <td className="px-3 py-3 text-right font-mono text-[12px] font-medium">
                          {tx.value} <span className="text-muted-foreground">GRD</span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                          {tx.fee}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border bg-gray-50/50">
            <p className="text-xs text-muted-foreground">
              {t("txs.showing_count").replace("{0}", txList.length.toString())}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          {t("txs.info_text")}
        </p>
      </div>
    </Layout>
  );
}
