import { Layout } from "@/components/Layout";
import { useGetLatestBlocks, useGetNetworkStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatTimeAgo, formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Box } from "lucide-react";
import { useBlockStream } from "@/hooks/use-block-stream";

export function Blocks() {
  const { t } = useI18n();
  useBlockStream();
  const { data: blocks, isLoading } = useGetLatestBlocks(
    { limit: 50 },
    {},
  );
  const { data: stats } = useGetNetworkStats({});

  const blockList = blocks && Array.isArray(blocks) ? blocks : [];

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold mb-1">{t("blocks.title")}</h1>
          <p className="text-white/70 text-sm">{t("blocks.subtitle")}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.block_height")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? formatNumber(stats.latestBlock) : "..."}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.avg_block_time")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? `${stats.avgBlockTime.toFixed(1)}s` : "..."}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.total_transactions")}</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? formatNumber(stats.totalTransactions) : "..."}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.network")}</p>
            <p className="text-[18px] font-bold text-foreground">GarudaChain</p>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">
            {t("common.block_height")}{" "}
            <span className="text-primary">#{stats ? formatNumber(stats.latestBlock) : "..."}</span>
          </p>
          <p className="text-xs text-muted-foreground">({t("blocks.showing_latest")})</p>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80 text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">{t("common.blocks")}</th>
                  <th className="px-3 py-3 text-left text-primary">{t("common.time")}</th>
                  <th className="px-3 py-3 text-left">{t("blocks.txns")}</th>
                  <th className="px-3 py-3 text-left">{t("common.miner")}</th>
                  <th className="px-3 py-3 text-right">Gas Used</th>
                  <th className="px-3 py-3 text-right">Gas Limit</th>
                  <th className="px-3 py-3 text-right">{t("common.size")}</th>
                  <th className="px-3 py-3 text-right text-primary">{t("common.reward")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50 animate-pulse">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                        ))}
                      </tr>
                    ))
                  : blockList.map((block) => (
                      <tr key={block.hash} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-3 py-3">
                          <Link href={`/block/${block.number}`} className="text-primary hover:underline font-mono text-[12px] flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5 text-muted-foreground" />
                            {block.number}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap text-[12px]">
                          {formatTimeAgo(block.timestamp)}
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/block/${block.number}`} className="text-primary hover:underline text-[12px]">
                            {block.transactionCount}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          {block.validator ? (
                            <Link href={`/address/${block.validator}`} className="text-primary hover:underline font-mono text-[12px]">
                              {block.validator.slice(0, 8)}...{block.validator.slice(-4)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-[12px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] text-muted-foreground">
                          {block.gasUsed.toLocaleString()}
                          {block.gasLimit > 0 && (
                            <span className="text-[10px] ml-1">
                              ({((block.gasUsed / block.gasLimit) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] text-muted-foreground">
                          {block.gasLimit.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] text-muted-foreground">
                          {block.size.toLocaleString()} B
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] font-medium">
                          0.1 <span className="text-muted-foreground">GRD</span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-border bg-gray-50/50">
            <p className="text-xs text-muted-foreground">
              {t("blocks.showing_count").replace("{0}", blockList.length.toString())}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
