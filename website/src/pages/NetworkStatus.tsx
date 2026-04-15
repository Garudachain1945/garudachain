import { Layout } from "@/components/Layout";
import { useGetNetworkStats, useGetLatestBlocks, useHealthCheck } from "@workspace/api-client-react";
import { formatNumber, formatTimeAgo } from "@/lib/utils";
import { Link } from "wouter";
import {
  Server,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  Zap,
  Shield,
  Globe,
  Layers,
  Box,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export function NetworkStatus() {
  const { data: stats, isLoading } = useGetNetworkStats({ query: { refetchInterval: 5000 } });
  const { data: blocks } = useGetLatestBlocks({ limit: 20 }, { query: { refetchInterval: 5000 } });
  const { data: health } = useHealthCheck({ query: { refetchInterval: 5000 } });

  const isHealthy = health?.status === "ok";
  const latestBlock = stats?.latestBlock ?? 0;

  // Calculate block time stats from recent blocks
  let avgBlockTime = 0;
  let minBlockTime = 0;
  let maxBlockTime = 0;
  const blockTimes: number[] = [];

  const blockArr = Array.isArray(blocks) ? blocks : [];
  if (blockArr.length > 1) {
    const times = blockArr.map((b) => new Date(b.timestamp).getTime());
    for (let i = 0; i < times.length - 1; i++) {
      const diff = (times[i] - times[i + 1]) / 1000;
      if (diff > 0) blockTimes.push(diff);
    }
    if (blockTimes.length > 0) {
      avgBlockTime = blockTimes.reduce((a, b) => a + b, 0) / blockTimes.length;
      minBlockTime = Math.min(...blockTimes);
      maxBlockTime = Math.max(...blockTimes);
    }
  }

  // Calculate total gas from recent blocks
  const totalGasUsed = blockArr.reduce((sum, b) => sum + b.gasUsed, 0);
  const totalGasLimit = blockArr.reduce((sum, b) => sum + b.gasLimit, 0);
  const gasUtilization = totalGasLimit > 0 ? ((totalGasUsed / totalGasLimit) * 100).toFixed(1) : "0";

  // Calculate avg txs per block
  const avgTxPerBlock =
    blockArr.length > 0
      ? (blockArr.reduce((sum, b) => sum + b.transactionCount, 0) / blockArr.length).toFixed(1)
      : "0";

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center gap-3 mb-2">
            <Server className="w-7 h-7" />
            <h1 className="text-2xl md:text-3xl font-bold">Network Status</h1>
            <div
              className={`ml-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ${
                isHealthy ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"
              }`}
            >
              <div className={`w-2 h-2 rounded-full animate-pulse ${isHealthy ? "bg-emerald-400" : "bg-red-400"}`} />
              {isHealthy ? "ONLINE" : "OFFLINE"}
            </div>
          </div>
          <p className="text-white/70 text-sm">
            Status jaringan GarudaChain Mainnet — Monitoring real-time
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl flex-1">
        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Network Status",
              value: isHealthy ? "Online" : "Offline",
              icon: isHealthy ? CheckCircle2 : XCircle,
              color: isHealthy ? "text-emerald-600" : "text-red-600",
              sub: "GarudaChain Mainnet",
            },
            {
              label: "Block Height",
              value: isLoading ? "..." : `#${formatNumber(latestBlock)}`,
              icon: Box,
              color: "text-primary",
              sub: blocks?.[0] ? `Last: ${formatTimeAgo(blocks[0].timestamp)}` : "...",
            },
            {
              label: "Avg Block Time",
              value: avgBlockTime > 0 ? `${avgBlockTime.toFixed(1)}s` : "...",
              icon: Clock,
              color: "text-blue-600",
              sub: avgBlockTime > 0 ? `Range: ${minBlockTime.toFixed(0)}s - ${maxBlockTime.toFixed(0)}s` : "...",
            },
            {
              label: "TPS (Transactions/sec)",
              value: stats?.tps?.toFixed(2) ?? "0",
              icon: Zap,
              color: "text-amber-600",
              sub: `Total: ${formatNumber(stats?.totalTransactions ?? 0)}`,
            },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{c.label}</p>
              </div>
              <p className={`text-[16px] font-bold ${c.color === "text-emerald-600" || c.color === "text-red-600" ? c.color : "text-foreground"}`}>
                {c.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Chain Info */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Chain Information
            </h2>
            <div className="space-y-2 text-[12px]">
              {[
                { label: "Network Name", value: "GarudaChain Mainnet" },
                { label: "Symbol", value: "GRD (Garuda Rupiah Digital)" },
                { label: "Consensus", value: "Proof of Work (SHA-256d)" },
                { label: "Base", value: "Bitcoin Core v28.1 Fork" },
                { label: "P2P Port", value: "9333" },
                { label: "RPC Port", value: "9446" },
                { label: "Block Reward", value: "0.01 GRD (= Rp 10)" },
                { label: "APBN Allocation", value: "1% (0.0001 GRD/block)" },
                { label: "Peg Value", value: "1 GRD = Rp 1.000" },
                { label: "Signature", value: "MuSig2 Schnorr (5-Layer)" },
                { label: "UTXO Model", value: "Bitcoin-compatible" },
              ].map((r) => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium text-foreground text-right">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mining Stats */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              Mining & Performance
            </h2>
            <div className="space-y-2 text-[12px]">
              {[
                { label: "Block Height", value: isLoading ? "..." : formatNumber(latestBlock) },
                { label: "Total Transactions", value: isLoading ? "..." : formatNumber(stats?.totalTransactions ?? 0) },
                { label: "Total Addresses", value: isLoading ? "..." : formatNumber(stats?.totalAddresses ?? 0) },
                { label: "Avg Block Time", value: avgBlockTime > 0 ? `${avgBlockTime.toFixed(1)} seconds` : "..." },
                { label: "Min Block Time (recent)", value: minBlockTime > 0 ? `${minBlockTime.toFixed(1)} seconds` : "..." },
                { label: "Max Block Time (recent)", value: maxBlockTime > 0 ? `${maxBlockTime.toFixed(1)} seconds` : "..." },
                { label: "Avg Tx/Block (recent)", value: avgTxPerBlock },
                { label: "Gas Utilization (recent)", value: `${gasUtilization}%` },
                {
                  label: "Total Supply",
                  value: `${formatNumber(latestBlock * 0.01)} GRD`,
                },
                { label: "Validators/Nodes", value: isLoading ? "..." : formatNumber(stats?.validators ?? 0) },
              ].map((r) => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium text-foreground text-right">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Blocks Table */}
        <div className="bg-white border border-border rounded-lg shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Recent Block Activity
            </h2>
            <Link href="/blocks" className="text-[12px] text-primary hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-semibold">Block</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Age</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Txn</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Miner</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Gas Used</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Size</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Block Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {blockArr.map((block, index) => {
                  const nextBlock = blockArr[index + 1];
                  const blockTime =
                    nextBlock
                      ? ((new Date(block.timestamp).getTime() - new Date(nextBlock.timestamp).getTime()) / 1000).toFixed(0)
                      : "-";
                  return (
                    <tr key={block.number} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <Link href={`/block/${block.number}`} className="text-primary hover:underline font-medium">
                          #{formatNumber(block.number)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatTimeAgo(block.timestamp)}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-gray-100 text-foreground px-1.5 py-0.5 rounded font-medium">
                          {block.transactionCount}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-[11px]">
                        <Link href={`/address/${block.validator}`} className="text-primary hover:underline">
                          {block.validator.slice(0, 10)}...
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {formatNumber(block.gasUsed)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {formatNumber(block.size)} B
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-medium ${Number(blockTime) > 600 ? "text-amber-600" : "text-emerald-600"}`}>
                          {blockTime === "-" ? "-" : `${blockTime}s`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Security Overview */}
        <div className="bg-white border border-border rounded-lg p-5 shadow-sm mb-6">
          <h2 className="text-[15px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Security Architecture
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                title: "Proof of Work",
                desc: "SHA-256d consensus — keamanan terbukti sejak Bitcoin 2009. Desentralisasi penuh tanpa izin khusus.",
                icon: Cpu,
                color: "text-primary",
              },
              {
                title: "UTXO Model",
                desc: "Bitcoin-compatible UTXO untuk transparansi dan auditability penuh. Setiap coin dapat dilacak.",
                icon: HardDrive,
                color: "text-emerald-600",
              },
            ].map((s) => (
              <div key={s.title} className="bg-gray-50 border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <h3 className="text-[13px] font-bold text-foreground">{s.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
