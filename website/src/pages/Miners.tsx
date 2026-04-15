import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetNetworkStats, useGetLatestBlocks } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatNumber, formatTimeAgo, truncateHash } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { Server, Activity, Cpu, Shield, BarChart3, Zap, Clock, Trophy } from "lucide-react";

interface MiningData {
  networkHashrate: number;
  difficulty: number;
  blockHeight: number;
  peers: number;
  blockReward: number;
  apbnFeeRate: number;
  algorithm: string;
  version: string;
}

interface TopMiner {
  address: string;
  blocksFound: number;
  totalReward: number;
  lastBlock: number;
  rank: number;
  firstBlock: number;
}

function formatHashrate(h: number): string {
  if (h >= 1e12) return `${(h / 1e12).toFixed(2)} TH/s`;
  if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(2)} KH/s`;
  return `${h.toFixed(2)} H/s`;
}

function formatDifficulty(d: number): string {
  if (d >= 1e12) return `${(d / 1e12).toFixed(2)}T`;
  if (d >= 1e9) return `${(d / 1e9).toFixed(2)}G`;
  if (d >= 1e6) return `${(d / 1e6).toFixed(2)}M`;
  if (d >= 1e3) return `${(d / 1e3).toFixed(2)}K`;
  return d.toFixed(2);
}

export function Miners() {
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 10000 } });
  const { data: blocks } = useGetLatestBlocks({ limit: 20 }, { query: { refetchInterval: 10000 } });

  const [miningData, setMiningData] = useState<MiningData | null>(null);
  const [topMiners, setTopMiners] = useState<TopMiner[]>([]);

  useEffect(() => {
    const fetchData = () => {
      fetch(apiUrl("/api/blockchain/mining"))
        .then(res => res.json())
        .then(data => setMiningData(data))
        .catch(() => {});
      fetch(apiUrl("/api/blockchain/top-miners?limit=50"))
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTopMiners(data);
        })
        .catch(() => {});
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const blockList = blocks && Array.isArray(blocks) ? blocks : [];
  const avgBlockTime = stats?.avgBlockTime ?? 60;

  const totalHashrate = miningData ? formatHashrate(miningData.networkHashrate) : "—";
  const difficulty = miningData ? formatDifficulty(miningData.difficulty) : "—";
  const totalMiners = topMiners.length;
  const blockReward = miningData?.blockReward ?? 0.01;

  const totalBlocksAllMiners = topMiners.reduce((s, m) => s + m.blocksFound, 0);

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Server className="w-7 h-7" />
            <h1 className="text-2xl font-bold">Miners & Validators</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Daftar miner yang aktif menambang block di GarudaChain. Setiap miner mendapatkan
            {miningData ? ` ${(miningData.blockReward * 0.92).toFixed(4)} GRD (92% dari block reward ${miningData.blockReward} GRD)` : " 92% dari block reward"} per block yang berhasil ditambang.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Total Hashrate</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{totalHashrate}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Server className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Active Miners</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{totalMiners}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Difficulty</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{difficulty}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Avg Block Time</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{avgBlockTime}s</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Block Reward</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{blockReward} GRD</p>
          </div>
        </div>

        {/* Hashrate Distribution (by blocks found) */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Distribusi Hashrate
          </h3>
          <div className="space-y-2">
            {topMiners.slice(0, 5).map((m, idx) => {
              const pct = totalBlocksAllMiners > 0 ? (m.blocksFound / totalBlocksAllMiners * 100) : 0;
              return (
                <div key={m.address}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                      <Link href={`/address/${m.address}`} className="text-[12px] font-medium text-primary hover:underline font-mono">
                        {truncateHash(m.address, 10, 6)}
                      </Link>
                    </div>
                    <span className="text-[12px] font-semibold text-muted-foreground">{pct.toFixed(1)}% ({formatNumber(m.blocksFound)} blocks)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Miner Table */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-[14px] font-bold text-foreground">Top Miners</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Rank</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Address</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Blocks Found</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Total Reward</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">First Block</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Last Block</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topMiners.map((m) => (
                  <tr key={m.address} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {m.rank === 1 ? <Trophy className="w-4 h-4 text-amber-500" /> :
                         m.rank === 2 ? <Trophy className="w-4 h-4 text-gray-400" /> :
                         m.rank === 3 ? <Trophy className="w-4 h-4 text-amber-700" /> :
                         <span className="text-muted-foreground w-4 text-center">{m.rank}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/address/${m.address}`} className="text-primary hover:underline font-mono text-[12px]">
                        {truncateHash(m.address, 10, 6)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatNumber(m.blocksFound)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{formatNumber(m.totalReward)} GRD</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/block/${m.firstBlock}`} className="text-primary hover:underline text-[12px]">
                        #{formatNumber(m.firstBlock)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/block/${m.lastBlock}`} className="text-primary hover:underline text-[12px]">
                        #{formatNumber(m.lastBlock)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Mined Blocks */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Block Terbaru yang Ditambang
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Block</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Validator</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Txns</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Reward</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">APBN</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Size</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {blockList.map(block => (
                  <tr key={block.number} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/block/${block.number}`} className="text-primary hover:underline font-semibold">
                        #{formatNumber(block.number)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/address/${block.validator}`} className="text-primary hover:underline font-mono text-[12px]">
                        {truncateHash(block.validator, 10, 6)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right">{block.transactionCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-600">{((miningData?.blockReward ?? 0.01) * 0.92).toFixed(4)} GRD</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{((miningData?.blockReward ?? 0.01) * 0.08).toFixed(4)} GRD</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{(block.size / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground text-[12px]">{formatTimeAgo(block.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mining Info */}
        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-[14px] font-bold text-foreground mb-3">Tentang Mining GarudaChain</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px] text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground mb-1">Algoritma Konsensus</p>
              <p>GarudaChain menggunakan Proof of Work (PoW) berbasis SHA-256d, sama seperti Bitcoin Core v28.1.
                Miner berkompetisi untuk menemukan hash block yang memenuhi target difficulty.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Distribusi Reward</p>
              <p>Block reward <strong>{miningData?.blockReward ?? 0.01} GRD</strong> per block. 92% (<strong>{((miningData?.blockReward ?? 0.01) * 0.92).toFixed(4)} GRD</strong>) untuk miner,
                8% (<strong>{((miningData?.blockReward ?? 0.01) * 0.08).toFixed(4)} GRD</strong>) otomatis masuk APBN Wallet. Tidak ada halving — block reward tetap sesuai governance protocol.</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
