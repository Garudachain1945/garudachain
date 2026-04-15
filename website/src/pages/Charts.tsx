import { Layout } from "@/components/Layout";
import { useGetNetworkStats, useGetLatestBlocks } from "@workspace/api-client-react";
import { formatNumber, formatTimeAgo } from "@/lib/utils";
import { useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Box,
  Coins,
  Zap,
  Activity,
  Building2,
} from "lucide-react";

function MiniBarChart({ data, color, height = 80 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const barWidth = Math.max(100 / data.length - 1, 2);

  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((val, i) => (
        <div
          key={i}
          className={`${color} rounded-t-sm opacity-80 hover:opacity-100 transition-opacity`}
          style={{
            height: `${Math.max((val / max) * 100, 2)}%`,
            width: `${barWidth}%`,
          }}
          title={`${val.toFixed(1)}`}
        />
      ))}
    </div>
  );
}

export function Charts() {
  const { data: stats, isLoading } = useGetNetworkStats({ query: { refetchInterval: 10000 } });
  const { data: blocks } = useGetLatestBlocks({ limit: 50 }, { query: { refetchInterval: 10000 } });

  const latestBlock = stats?.latestBlock ?? 0;
  const totalSupply = latestBlock * 0.01;
  const apbnReserve = Math.floor(totalSupply * 0.01);

  // Compute chart data from blocks
  const chartData = useMemo(() => {
    if (!Array.isArray(blocks) || blocks.length < 2) {
      return { blockTimes: [], txCounts: [], gasPcts: [], sizes: [] };
    }

    const sorted = [...blocks].sort((a, b) => a.number - b.number);
    const blockTimes: number[] = [];
    const txCounts: number[] = [];
    const gasPcts: number[] = [];
    const sizes: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()) / 1000;
      if (diff > 0) blockTimes.push(diff);
      txCounts.push(sorted[i].transactionCount);
      gasPcts.push(sorted[i].gasLimit > 0 ? (sorted[i].gasUsed / sorted[i].gasLimit) * 100 : 0);
      sizes.push(sorted[i].size);
    }

    return { blockTimes, txCounts, gasPcts, sizes };
  }, [blocks]);

  const avgBlockTime =
    chartData.blockTimes.length > 0
      ? chartData.blockTimes.reduce((a, b) => a + b, 0) / chartData.blockTimes.length
      : 0;

  const avgTxPerBlock =
    chartData.txCounts.length > 0
      ? chartData.txCounts.reduce((a, b) => a + b, 0) / chartData.txCounts.length
      : 0;

  const avgGasUtil =
    chartData.gasPcts.length > 0
      ? chartData.gasPcts.reduce((a, b) => a + b, 0) / chartData.gasPcts.length
      : 0;

  const avgSize =
    chartData.sizes.length > 0
      ? chartData.sizes.reduce((a, b) => a + b, 0) / chartData.sizes.length
      : 0;

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-7 h-7" />
            <h1 className="text-2xl md:text-3xl font-bold">Charts & Analytics</h1>
          </div>
          <p className="text-white/70 text-sm">
            Statistik dan grafik real-time GarudaChain — Data dari {blocks?.length ?? 0} block terakhir
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl flex-1">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Block Height",
              value: isLoading ? "..." : `#${formatNumber(latestBlock)}`,
              icon: Box,
              color: "text-primary",
            },
            {
              label: "Total Supply",
              value: isLoading ? "..." : `${formatNumber(totalSupply)} GRD`,
              icon: Coins,
              color: "text-emerald-600",
            },
            {
              label: "APBN Reserve",
              value: isLoading ? "..." : `${formatNumber(apbnReserve)} GRD`,
              icon: Building2,
              color: "text-amber-600",
            },
            {
              label: "Total Transaksi",
              value: isLoading ? "..." : formatNumber(stats?.totalTransactions ?? 0),
              icon: Activity,
              color: "text-blue-600",
            },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{c.label}</p>
              </div>
              <p className="text-[16px] font-bold text-foreground">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Block Time Chart */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Block Time (seconds)
              </h2>
              <span className="text-[11px] text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                Avg: {avgBlockTime > 0 ? `${avgBlockTime.toFixed(1)}s` : "..."}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <MiniBarChart data={chartData.blockTimes} color="bg-blue-500" height={100} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
              <span>Older blocks</span>
              <span>Latest blocks</span>
            </div>
            {chartData.blockTimes.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                <div className="bg-blue-50 rounded p-2 text-center">
                  <p className="text-muted-foreground">Min</p>
                  <p className="font-bold text-foreground">{Math.min(...chartData.blockTimes).toFixed(0)}s</p>
                </div>
                <div className="bg-blue-50 rounded p-2 text-center">
                  <p className="text-muted-foreground">Avg</p>
                  <p className="font-bold text-foreground">{avgBlockTime.toFixed(0)}s</p>
                </div>
                <div className="bg-blue-50 rounded p-2 text-center">
                  <p className="text-muted-foreground">Max</p>
                  <p className="font-bold text-foreground">{Math.max(...chartData.blockTimes).toFixed(0)}s</p>
                </div>
              </div>
            )}
          </div>

          {/* Transactions per Block */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Transactions per Block
              </h2>
              <span className="text-[11px] text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                Avg: {avgTxPerBlock.toFixed(1)}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <MiniBarChart data={chartData.txCounts} color="bg-emerald-500" height={100} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
              <span>Older blocks</span>
              <span>Latest blocks</span>
            </div>
            {chartData.txCounts.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                <div className="bg-emerald-50 rounded p-2 text-center">
                  <p className="text-muted-foreground">Min</p>
                  <p className="font-bold text-foreground">{Math.min(...chartData.txCounts)}</p>
                </div>
                <div className="bg-emerald-50 rounded p-2 text-center">
                  <p className="text-muted-foreground">Avg</p>
                  <p className="font-bold text-foreground">{avgTxPerBlock.toFixed(1)}</p>
                </div>
                <div className="bg-emerald-50 rounded p-2 text-center">
                  <p className="text-muted-foreground">Max</p>
                  <p className="font-bold text-foreground">{Math.max(...chartData.txCounts)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Gas Utilization Chart */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" />
                Gas Utilization (%)
              </h2>
              <span className="text-[11px] text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                Avg: {avgGasUtil.toFixed(1)}%
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <MiniBarChart data={chartData.gasPcts} color="bg-amber-500" height={100} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
              <span>Older blocks</span>
              <span>Latest blocks</span>
            </div>
          </div>

          {/* Block Size Chart */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-600" />
                Block Size (bytes)
              </h2>
              <span className="text-[11px] text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                Avg: {formatNumber(Math.round(avgSize))} B
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <MiniBarChart data={chartData.sizes} color="bg-purple-500" height={100} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
              <span>Older blocks</span>
              <span>Latest blocks</span>
            </div>
          </div>
        </div>

        {/* Supply Growth & Economics */}
        <div className="bg-white border border-border rounded-lg p-5 shadow-sm mb-6">
          <h2 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
            <Coins className="w-4 h-4 text-primary" />
            Supply & Economics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Supply Distribution Visual */}
            <div className="md:col-span-2">
              <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Supply Distribution
              </h3>
              <div className="flex rounded-lg overflow-hidden h-10 mb-3">
                <div
                  className="bg-emerald-500 flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ width: "99%" }}
                >
                  Miner Rewards: 99%
                </div>
                <div
                  className="bg-amber-500 flex items-center justify-center"
                  style={{ width: "1%" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-muted-foreground mb-1">Miner Rewards (99%)</p>
                  <p className="font-bold text-foreground text-[15px]">
                    {formatNumber(totalSupply - apbnReserve)} GRD
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">0.0099 GRD per block</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-muted-foreground mb-1">APBN Reserve (1%)</p>
                  <p className="font-bold text-foreground text-[15px]">{formatNumber(apbnReserve)} GRD</p>
                  <p className="text-[10px] text-muted-foreground mt-1">0.0001 GRD per block</p>
                </div>
              </div>
            </div>

            {/* Key Economics */}
            <div>
              <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Key Metrics
              </h3>
              <div className="space-y-2 text-[12px]">
                {[
                  { label: "Total Supply", value: `${formatNumber(totalSupply)} GRD` },
                  { label: "Block Reward", value: "0.01 GRD (= Rp 10)" },
                  { label: "Max Supply", value: "Unlimited (Governance)" },
                  { label: "Blocks Mined", value: formatNumber(latestBlock) },
                  { label: "TPS", value: stats?.tps?.toFixed(2) ?? "0" },
                  { label: "Addresses", value: formatNumber(stats?.totalAddresses ?? 0) },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between py-1.5 border-b border-gray-50">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-medium text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Supply Growth Projection */}
        <div className="bg-white border border-border rounded-lg p-5 shadow-sm mb-6">
          <h2 className="text-[15px] font-bold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Proyeksi Supply (berdasarkan 0.01 GRD/block)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 font-semibold">Milestone</th>
                  <th className="text-right px-4 py-2 font-semibold">Block Height</th>
                  <th className="text-right px-4 py-2 font-semibold">Total Supply (GRD)</th>
                  <th className="text-right px-4 py-2 font-semibold">APBN Reserve (GRD)</th>
                  <th className="text-center px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { name: "10K Blocks", blocks: 10000 },
                  { name: "50K Blocks", blocks: 50000 },
                  { name: "100K Blocks", blocks: 100000 },
                  { name: "210K Blocks", blocks: 210000 },
                  { name: "500K Blocks", blocks: 500000 },
                  { name: "1M Blocks", blocks: 1000000 },
                ].map((m) => {
                  const supply = m.blocks * 0.01;
                  const apbn = Math.floor(supply * 0.01);
                  const reached = latestBlock >= m.blocks;
                  return (
                    <tr key={m.name} className={reached ? "bg-emerald-50/30" : ""}>
                      <td className="px-4 py-2.5 font-medium text-foreground">{m.name}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {formatNumber(m.blocks)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatNumber(supply)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600">{formatNumber(apbn)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {reached ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                            REACHED
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                            PENDING
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
