import { Layout } from "@/components/Layout";
import { SearchBox } from "@/components/SearchBox";
import { useGetNetworkStats, useGetLatestBlocks, useGetLatestTransactions } from "@workspace/api-client-react";
import { formatTimeAgo, truncateHash, formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";
import { Box, FileText, Database, Activity, Server, Layers, ArrowRight, BarChart3, Globe, Shield, Coins } from "lucide-react";
import { useBlockStream } from "@/hooks/use-block-stream";

export function Home() {
  const { t } = useI18n();

  // SSE — real-time block updates (no polling, push-based)
  useBlockStream();

  const { data: rawStats, isLoading: statsLoading } = useGetNetworkStats({});
  const stats = rawStats && typeof rawStats === "object" ? rawStats : undefined;

  const { data: rawBlocks, isLoading: blocksLoading } = useGetLatestBlocks({ limit: 6 }, {});
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : undefined;

  const { data: rawTxs, isLoading: txsLoading } = useGetLatestTransactions({ limit: 6 }, {});
  const txs = Array.isArray(rawTxs) ? rawTxs : undefined;

  // Block reward = 1 GRD per block
  const totalSupply = (stats?.latestBlock ?? 0) * 1;

  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white pt-16 pb-20 px-4 relative">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4 overflow-hidden">
          <svg width="600" height="600" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 25 L65 35 V60 L50 75 L35 60 V35 L50 25Z" fill="white"/>
            <path d="M30 45 L10 20 L25 50 L5 40 L20 60 L15 75 L35 65 Z" fill="white"/>
            <path d="M70 45 L90 20 L75 50 L95 40 L80 60 L85 75 L65 65 Z" fill="white"/>
          </svg>
        </div>

        <div className="container mx-auto relative z-50 max-w-5xl">
          <h1 className="text-3xl md:text-[40px] font-bold mb-3 tracking-tight">
            {t("home.title")}
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-8 font-medium">
            {t("home.subtitle")}
          </p>

          <SearchBox size="lg" className="max-w-full shadow-2xl" />
        </div>
      </section>

      {/* Stats Strip */}
      <section className="container mx-auto px-4 -mt-8 relative z-40 mb-8">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-0 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-gray-200">

          <div className="p-5 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-1">
              <Layers className="w-4 h-4" /> {t("common.total_supply").toUpperCase()}
            </div>
            <div className="text-foreground">
              <span className="text-lg font-medium">{statsLoading ? "..." : formatNumber(totalSupply)} GRD</span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-1">
              <Database className="w-4 h-4" /> {t("common.block_height").toUpperCase()}
            </div>
            <div className="text-foreground text-lg font-medium">
              {statsLoading ? "..." : formatNumber(stats?.latestBlock ?? 0)}
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-1">
              <Activity className="w-4 h-4" /> {t("common.transactions").toUpperCase()}
            </div>
            <div className="text-foreground">
              <span className="text-lg font-medium">{statsLoading ? "..." : formatNumber(stats?.totalTransactions ?? 0)}</span>
              <span className="text-sm text-muted-foreground ml-2">({statsLoading ? "..." : (stats?.tps ?? 0).toFixed(1)} TPS)</span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-1">
              <Server className="w-4 h-4" /> {t("common.avg_block_time").toUpperCase()}
            </div>
            <div className="text-foreground">
              <span className="text-lg font-medium">{statsLoading ? "..." : `${(stats?.avgBlockTime ?? 5).toFixed(1)}s`}</span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-center bg-gray-50/50">
            <div className="text-muted-foreground text-[13px] font-medium mb-1 uppercase tracking-wider">
              {t("common.last_finalized")}
            </div>
            <div className="text-foreground text-lg font-medium">
              {statsLoading ? "..." : formatNumber(Math.max(0, (stats?.latestBlock ?? 0) - 2))}
            </div>
            <div className="text-muted-foreground text-[13px] font-medium mt-3 uppercase tracking-wider">
              {t("common.network")}
            </div>
            <div className="text-foreground text-lg font-medium">
              {t("home.mainnet")}
            </div>
          </div>

        </div>
      </section>

      {/* Main Content Area */}
      <section className="container mx-auto px-4 mb-16 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Latest Blocks */}
          <div className="bg-white border border-[#e8e8e8] rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#e8e8e8] flex items-center gap-2 bg-white">
              <h2 className="text-[17px] font-bold text-foreground">{t("home.latest_blocks")}</h2>
            </div>

            <div className="flex-1">
              {blocksLoading ? (
                <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
              ) : (
                <div className="divide-y divide-[#e8e8e8]">
                  {blocks?.map((block) => (
                    <div key={block.hash} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 sm:w-1/3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                          <Box className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/block/${block.number}`} className="font-medium text-primary hover:text-primary/80 transition-colors">
                            {block.number}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatTimeAgo(block.timestamp)}
                          </p>
                        </div>
                      </div>

                      <div className="sm:w-1/3 min-w-0">
                        <div className="text-[13px] flex items-center gap-1 truncate">
                          <span className="text-foreground">{t("common.miner")}</span>
                          {block.validator ? (
                            <Link href={`/address/${block.validator}`} className="text-primary hover:text-primary/80 truncate">
                              {truncateHash(block.validator)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <p className="text-[13px] mt-0.5 text-primary">
                          <Link href={`/block/${block.number}`} className="hover:underline">{block.transactionCount} {t("home.txns")}</Link>
                        </p>
                      </div>

                      <div className="sm:w-1/3 text-left sm:text-right">
                        <span className="text-[13px] font-medium border border-[#e8e8e8] bg-gray-50 px-2 py-1 rounded text-foreground inline-block">
                          1 GRD
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-[#e8e8e8] text-center">
              <Link href="/blocks" className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors uppercase tracking-wide flex items-center justify-center w-full gap-1">
                {t("home.view_all_blocks")} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Latest Transactions */}
          <div className="bg-white border border-[#e8e8e8] rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#e8e8e8] flex items-center gap-2 bg-white">
              <h2 className="text-[17px] font-bold text-foreground">{t("home.latest_txs")}</h2>
            </div>

            <div className="flex-1">
              {txsLoading ? (
                <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
              ) : (
                <div className="divide-y divide-[#e8e8e8]">
                  {txs?.map((tx) => (
                    <div key={tx.hash} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 sm:w-1/3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/tx/${tx.hash}`} className="font-medium text-primary hover:text-primary/80 transition-colors truncate block max-w-[140px]">
                            {tx.hash}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatTimeAgo(tx.timestamp)}
                          </p>
                        </div>
                      </div>

                      <div className="sm:w-1/3 min-w-0 flex flex-col gap-0.5">
                        <div className="text-[13px] flex items-center gap-1 truncate">
                          <span className="text-foreground">{t("common.from")}</span>
                          {tx.from === "coinbase" ? (
                            <span className="text-amber-600 font-semibold">Coinbase</span>
                          ) : (
                            <Link href={`/address/${tx.from}`} className="text-primary hover:text-primary/80 truncate">
                              {truncateHash(tx.from)}
                            </Link>
                          )}
                        </div>
                        <div className="text-[13px] flex items-center gap-1 truncate">
                          <span className="text-foreground">{t("common.to")}</span>
                          {tx.to ? (
                            <Link href={`/address/${tx.to}`} className="text-primary hover:text-primary/80 truncate">
                              {truncateHash(tx.to)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>

                      <div className="sm:w-1/3 text-left sm:text-right">
                        <span className="text-[13px] font-medium border border-[#e8e8e8] bg-gray-50 px-2 py-1 rounded text-foreground inline-block">
                          {tx.value} GRD
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-[#e8e8e8] text-center">
              <Link href="/txs" className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors uppercase tracking-wide flex items-center justify-center w-full gap-1">
                {t("home.view_all_txs")} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

        </div>

        {/* Quick Access */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {[
            { label: "e-IPO & Presale", desc: "Beli saham saat presale (e-IPO) on-chain", href: "/ipo", icon: Coins, color: "text-primary" },
            { label: t("home.network_status"), desc: t("home.network_desc"), href: "/network", icon: Shield, color: "text-emerald-600" },
            { label: "Mining GRD", desc: "Mulai mining & dapatkan reward GRD", href: "/mining", icon: BarChart3, color: "text-blue-600" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white border border-[#e8e8e8] rounded-xl p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <item.icon className={`w-6 h-6 ${item.color} mb-3 group-hover:scale-110 transition-transform`} />
              <h3 className="text-[14px] font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                {item.label}
              </h3>
              <p className="text-[12px] text-muted-foreground">{item.desc}</p>
            </Link>
          ))}
        </div>

      </section>
    </Layout>
  );
}
