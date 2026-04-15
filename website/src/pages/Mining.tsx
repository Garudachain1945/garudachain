import { Layout } from "@/components/Layout";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { useI18n } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Pickaxe, Cpu, Zap, Clock, BarChart3, TrendingUp, Shield, AlertTriangle, Server, Activity, Hash, Box, DollarSign, Play } from "lucide-react";

interface TopMiner {
  address: string;
  blocksFound: number;
  totalReward: number;
  lastBlock: number;
  rank: number;
}

interface MiningStats {
  networkHashrate: number;
  difficulty: number;
  blockHeight: number;
  peers: number;
  blockReward: number;
  apbnFeeRate: number;
  algorithm: string;
  version: string;
}

function formatHashrate(h: number): string {
  if (h >= 1e12) return `${(h / 1e12).toFixed(2)} TH/s`;
  if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(2)} KH/s`;
  return `${h.toFixed(2)} H/s`;
}

function formatRp(num: number): string {
  if (num >= 1e9) return `Rp ${(num / 1e9).toFixed(1)} M`;
  if (num >= 1e6) return `Rp ${(num / 1e6).toFixed(1)} Jt`;
  if (num >= 1e3) return `Rp ${(num / 1e3).toFixed(0)} Rb`;
  return `Rp ${num.toLocaleString("id-ID")}`;
}

export function Mining() {
  const { t } = useI18n();
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 15000 } });
  const latestBlock = stats?.latestBlock ?? 0;

  // === REAL-TIME API DATA ===
  const [miningStats, setMiningStats] = useState<MiningStats | null>(null);
  const [topMiners, setTopMiners] = useState<TopMiner[]>([]);

  useEffect(() => {
    const fetchMiningData = async () => {
      try {
        const [miningRes, minersRes] = await Promise.all([
          fetch(apiUrl("/api/blockchain/mining")),
          fetch(apiUrl("/api/blockchain/top-miners?limit=50")),
        ]);
        if (miningRes.ok) {
          const data = await miningRes.json();
          setMiningStats(data);
        }
        if (minersRes.ok) {
          const data = await minersRes.json();
          setTopMiners(data);
        }
      } catch (e) {
        console.error("Failed to fetch mining data:", e);
      }
    };
    fetchMiningData();
    const interval = setInterval(fetchMiningData, 15000);
    return () => clearInterval(interval);
  }, []);

  const networkHashrate = miningStats?.networkHashrate ?? 0;
  const difficulty = miningStats?.difficulty ?? 0;
  const activeMiners = miningStats?.peers ?? 0;
  const blockReward = 0.01; // GRD per block
  const blockTime = stats?.avgBlockTime ?? 5; // seconds from real stats
  const apbnPercent = miningStats?.apbnFeeRate ?? 0.01; // 1%

  // === KALKULASI ===
  const blocksPerDay = blockTime > 0 ? (60 / blockTime) * 60 * 24 : 0;

  // Pendapatan per block (early stage: subsidy only, no tx fees yet)
  const subsidyPerBlock = blockReward; // 0.01 GRD
  const apbnPerBlock = subsidyPerBlock * apbnPercent;
  const minerPerBlock = subsidyPerBlock - apbnPerBlock;

  // Pendapatan per hari (seluruh jaringan)
  const apbnPerDay = apbnPerBlock * blocksPerDay;
  const minerTotalPerDay = minerPerBlock * blocksPerDay;

  const totalMined = latestBlock * blockReward;
  const totalAPBN = totalMined * apbnPercent;

  const [displayBlock, setDisplayBlock] = useState(latestBlock);
  useEffect(() => { setDisplayBlock(latestBlock); }, [latestBlock]);

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Pickaxe className="w-7 h-7" />
            <h1 className="text-2xl font-bold">{t("mining.title")}</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            {t("mining.subtitle")}
          </p>
          <div className="flex gap-3 mt-4">
            <Link href="/miner-mining" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-[#8B0000] font-semibold rounded-lg hover:bg-gray-100 transition text-sm">
              <Play className="w-4 h-4" />
              Mulai Mining
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Network Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{t("mining.hashrate")}</p>
            </div>
            <p className="text-[18px] font-bold text-primary">{formatHashrate(networkHashrate)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{t("mining.difficulty")}</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{formatNumber(difficulty)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Box className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{t("common.block_height")}</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{formatNumber(displayBlock)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{t("mining.block_time")}</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{blockTime}s</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{t("mining.block_reward")}</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{blockReward} GRD</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{t("mining.active_miners")}</p>
            </div>
            <p className="text-[18px] font-bold text-foreground">{formatNumber(activeMiners)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Mining Economics */}
          <div className="bg-white border border-border rounded-lg p-5">
            <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              {t("mining.economics")}
            </h3>

            <div className="space-y-3">
              {/* Per Block Breakdown */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold mb-2">{t("mining.per_block")}</p>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("mining.block_subsidy")}</span>
                    <span className="font-semibold">{subsidyPerBlock} GRD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">APBN ({(apbnPercent * 100).toFixed(0)}%)</span>
                    <span className="font-semibold">-{apbnPerBlock} GRD</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="font-semibold text-foreground">{t("mining.total_per_block")} (Miner)</span>
                    <span className="font-bold text-foreground">{minerPerBlock} GRD</span>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-[11px] text-emerald-700 uppercase font-semibold mb-1">{t("mining.miner_reward_day")}</p>
                <p className="text-[20px] font-bold text-emerald-700">{formatRp(minerTotalPerDay * 1000)}</p>
                <p className="text-[11px] text-emerald-600">{formatNumber(Math.round(minerTotalPerDay))} GRD (99%)</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-[11px] text-blue-700 uppercase font-semibold mb-1">{t("mining.apbn_day")}</p>
                <p className="text-[20px] font-bold text-blue-700">{formatRp(apbnPerDay * 1000)}</p>
                <p className="text-[11px] text-blue-600">1% → Treasury</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">{t("mining.total_mined")}</p>
                <p className="text-[18px] font-bold text-foreground">{formatNumber(totalMined)} GRD</p>
                <p className="text-[11px] text-muted-foreground">{t("mining.apbn_collected")}: {formatNumber(Math.round(totalAPBN))} GRD</p>
              </div>

              {/* Reward Distribution Bar */}
              <div>
                <p className="text-[12px] font-semibold text-foreground mb-2">{t("mining.revenue_source")}</p>
                <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${100 - apbnPercent * 100}%` }}>
                    Miner {(100 - apbnPercent * 100).toFixed(0)}%
                  </div>
                  <div className="bg-blue-500 h-full flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${apbnPercent * 100}%` }}>
                  </div>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Miner: {minerPerBlock} GRD/block</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> APBN: {apbnPerBlock} GRD/block</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Miners Table */}
          <div className="lg:col-span-2 bg-white border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {t("mining.top_miners")}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("mining.rank")}</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("mining.miner_address")}</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("mining.blocks_found")}</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("mining.block_reward")}</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Last Block</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topMiners.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-[12px]">
                        Loading miners data...
                      </td>
                    </tr>
                  ) : topMiners.map(miner => (
                    <tr key={miner.rank} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                          miner.rank === 1 ? "bg-yellow-100 text-yellow-700" :
                          miner.rank === 2 ? "bg-gray-100 text-gray-600" :
                          miner.rank === 3 ? "bg-orange-100 text-orange-700" :
                          "bg-gray-50 text-gray-500"
                        }`}>
                          {miner.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-foreground">{miner.address}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNumber(miner.blocksFound)}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">{miner.totalReward.toFixed(2)} GRD</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">#{formatNumber(miner.lastBlock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Fee Structure */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            {t("mining.fee_structure")}
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            {t("mining.fee_desc")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">{t("mining.tx_type")}</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">{t("mining.our_fee")}</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">{t("mining.conv_fee")}</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">{t("mining.savings")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { type: t("mining.transfer_grd"), fee: "Rp 100 (0.1 GRD)", conv: "Rp 2.500 - 6.500", save: "96%" },
                  { type: t("mining.buy_stock"), fee: "0.05%", conv: "0.15%", save: "3x" },
                  { type: t("mining.sell_stock"), fee: "0.05%", conv: "0.25%", save: "5x" },
                  { type: t("mining.buy_sell_sbn"), fee: "0.02%", conv: "0.05% + admin", save: "2.5x" },
                  { type: t("mining.swap_dex"), fee: "0.05%", conv: "0.10 - 0.30%", save: "2-6x" },
                ].map(row => (
                  <tr key={row.type} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{row.type}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{row.fee}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground line-through">{row.conv}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="bg-emerald-100 text-emerald-700 text-[11px] px-2 py-0.5 rounded font-semibold">{row.save}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Profit Calculator */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            {t("mining.profit_calc")}
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            {t("mining.profit_desc")}
          </p>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-primary" />
              <p className="text-[14px] font-bold text-foreground">Early Stage — Block Subsidy Only</p>
            </div>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("mining.block_subsidy")}</span>
                <span className="font-semibold">{blockReward} GRD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Block Time</span>
                <span className="font-semibold">{blockTime}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Blocks / Hari</span>
                <span className="font-semibold">{formatNumber(Math.round(blocksPerDay))}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Total Subsidy / Hari (Network)</span>
                <span className="font-semibold">{(blocksPerDay * blockReward).toFixed(2)} GRD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Miner Reward / Hari ({(100 - apbnPercent * 100).toFixed(0)}%)</span>
                <span className="font-semibold">{(minerTotalPerDay).toFixed(2)} GRD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">APBN / Hari ({(apbnPercent * 100).toFixed(0)}%)</span>
                <span className="font-semibold">{(apbnPerDay).toFixed(2)} GRD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Miners</span>
                <span className="font-semibold">{formatNumber(activeMiners)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== CARA MENJADI MINER ==================== */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-5 mb-6">
          <h3 className="text-[16px] font-bold text-foreground mb-1 flex items-center gap-2">
            <Pickaxe className="w-5 h-5 text-primary" />
            {t("mining.how_to")} — Panduan Lengkap
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            Siapa pun bisa menjadi miner GarudaChain. Tidak perlu izin khusus — cukup komputer dan koneksi internet.
          </p>

          {/* Step 1: System Requirements */}
          <div className="bg-white rounded-lg p-4 mb-3 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold shrink-0">1</div>
              <h4 className="text-[14px] font-bold text-foreground">Cek System Requirements</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Minimum (CPU Mining)</p>
                <ul className="text-[12px] text-foreground space-y-1">
                  <li>• CPU: 4 Core (x86_64)</li>
                  <li>• RAM: 4 GB</li>
                  <li>• Disk: 50 GB SSD</li>
                  <li>• Internet: 10 Mbps</li>
                  <li>• OS: Ubuntu 22.04 / Windows 10</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Recommended (GPU Mining)</p>
                <ul className="text-[12px] text-foreground space-y-1">
                  <li>• CPU: 8 Core</li>
                  <li>• RAM: 8 GB</li>
                  <li>• GPU: NVIDIA GTX 1660+</li>
                  <li>• Disk: 100 GB SSD</li>
                  <li>• Internet: 50 Mbps</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Optimal (ASIC Mining)</p>
                <ul className="text-[12px] text-foreground space-y-1">
                  <li>• ASIC: Antminer S19+</li>
                  <li>• RAM: 16 GB (untuk node)</li>
                  <li>• Disk: 200 GB NVMe</li>
                  <li>• Internet: 100 Mbps</li>
                  <li>• Listrik: 220V / 3 Phase</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 2: Download & Install */}
          <div className="bg-white rounded-lg p-4 mb-3 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold shrink-0">2</div>
              <h4 className="text-[14px] font-bold text-foreground">Download & Install GarudaChain Node</h4>
            </div>
            <div className="space-y-2">
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
                <p className="text-gray-500 mb-1"># Clone repository & build dari source</p>
                <p className="text-emerald-400">$ git clone https://github.com/garudachain/garudachain.git</p>
                <p className="text-emerald-400">$ cd garudachain</p>
                <p className="text-emerald-400">$ ./autogen.sh && ./configure && make -j$(nproc)</p>
                <p className="text-emerald-400">$ sudo make install</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
                <p className="text-gray-500 mb-1"># Atau download binary langsung (Linux/Windows/Mac)</p>
                <p className="text-emerald-400">$ wget https://releases.garudachain.org/v1.0/garudachain-1.0-linux-x86_64.tar.gz</p>
                <p className="text-emerald-400">$ tar -xzf garudachain-1.0-linux-x86_64.tar.gz</p>
                <p className="text-emerald-400">$ cd garudachain-1.0/bin/</p>
              </div>
            </div>
          </div>

          {/* Step 3: Konfigurasi */}
          <div className="bg-white rounded-lg p-4 mb-3 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold shrink-0">3</div>
              <h4 className="text-[14px] font-bold text-foreground">Konfigurasi Node (garudachain.conf)</h4>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
              <p className="text-gray-500 mb-1"># Buat file konfigurasi: ~/.garudachain/garudachain.conf</p>
              <p className="text-cyan-400 mt-2"># === Network ===</p>
              <p className="text-emerald-400">server=1</p>
              <p className="text-emerald-400">listen=1</p>
              <p className="text-emerald-400">port=9333</p>
              <p className="text-emerald-400">rpcport=9446</p>
              <p className="text-emerald-400">rpcuser=garudaminer</p>
              <p className="text-emerald-400">rpcpassword=YourSecurePassword123</p>
              <p className="text-cyan-400 mt-2"># === Seed Node (Wajib) ===</p>
              <p className="text-emerald-400">addnode=103.144.213.11:9333</p>
              <p className="text-emerald-400">addnode=seed1.garudachain.org:9333</p>
              <p className="text-emerald-400">addnode=seed2.garudachain.org:9333</p>
              <p className="text-cyan-400 mt-2"># === Mining ===</p>
              <p className="text-emerald-400">gen=1</p>
              <p className="text-emerald-400">genproclimit=-1  <span className="text-gray-500"># -1 = semua CPU core</span></p>
            </div>
          </div>

          {/* Step 4: Create Wallet & Start Mining */}
          <div className="bg-white rounded-lg p-4 mb-3 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold shrink-0">4</div>
              <h4 className="text-[14px] font-bold text-foreground">Buat Wallet & Mulai Mining</h4>
            </div>
            <div className="space-y-2">
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
                <p className="text-gray-500 mb-1"># Jalankan node (sync blockchain dulu)</p>
                <p className="text-emerald-400">$ garudad -daemon</p>
                <p className="text-emerald-400">$ garuda-cli getblockchaininfo  <span className="text-gray-500"># tunggu sync selesai</span></p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
                <p className="text-gray-500 mb-1"># Buat wallet & alamat mining</p>
                <p className="text-emerald-400">$ garuda-cli createwallet "mywallet"</p>
                <p className="text-emerald-400">$ garuda-cli getnewaddress "mining" "bech32"</p>
                <p className="text-gray-500"># Output: grd1q8f2a9k3x7m1p4e...</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
                <p className="text-gray-500 mb-1"># Mulai mining! (Solo Mining)</p>
                <p className="text-emerald-400">$ garuda-cli generatetoaddress 0 "grd1qYourAddress" 99999999</p>
                <p className="text-gray-500"># 0 = mine terus tanpa henti, 99999999 = max nonce tries</p>
              </div>
            </div>
          </div>

          {/* Step 5: Join Mining Pool */}
          <div className="bg-white rounded-lg p-4 mb-3 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold shrink-0">5</div>
              <h4 className="text-[14px] font-bold text-foreground">Join Mining Pool (Opsional)</h4>
            </div>
            <p className="text-[12px] text-muted-foreground mb-3">
              Untuk hashrate kecil, bergabung dengan mining pool lebih menguntungkan daripada solo mining.
              Reward dibagi proporsional berdasarkan kontribusi hashrate Anda.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              {[
                { name: "GarudaPool Official", url: "stratum+tcp://pool.garudachain.org:3333", fee: "1%" },
                { name: "NusantaraHash Pool", url: "stratum+tcp://nusantara.pool.id:3333", fee: "1.5%" },
                { name: "RajaBlock Pool", url: "stratum+tcp://rajablock.pool.id:3333", fee: "2%" },
              ].map(pool => (
                <div key={pool.name} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[12px] font-semibold text-foreground">{pool.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all mt-1">{pool.url}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Fee: {pool.fee}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
              <p className="text-gray-500 mb-1"># Contoh: Mining dengan cgminer ke pool</p>
              <p className="text-emerald-400">$ cgminer -o stratum+tcp://pool.garudachain.org:3333 \</p>
              <p className="text-emerald-400">  -u grd1qYourAddress -p x --sha256d</p>
            </div>
          </div>

          {/* Step 6: Monitor & Verify */}
          <div className="bg-white rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold shrink-0">6</div>
              <h4 className="text-[14px] font-bold text-foreground">Monitor & Verifikasi Reward</h4>
            </div>
            <div className="space-y-2">
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
                <p className="text-gray-500 mb-1"># Cek status mining</p>
                <p className="text-emerald-400">$ garuda-cli getmininginfo</p>
                <p className="text-gray-500 mt-2 mb-1"># Cek saldo wallet</p>
                <p className="text-emerald-400">$ garuda-cli getbalance</p>
                <p className="text-gray-500 mt-2 mb-1"># Cek network hashrate</p>
                <p className="text-emerald-400">$ garuda-cli getnetworkhashps</p>
                <p className="text-gray-500 mt-2 mb-1"># Lihat block terakhir yang Anda mine</p>
                <p className="text-emerald-400">$ garuda-cli listsinceblock</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Start Summary */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Quick Start — 3 Menit Mulai Mining
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-[12px] text-gray-300">
            <p className="text-gray-500 mb-1"># 1. Download & install</p>
            <p className="text-emerald-400">$ wget https://releases.garudachain.org/v1.0/garudachain-1.0-linux-x86_64.tar.gz</p>
            <p className="text-emerald-400">$ tar -xzf garudachain-1.0-linux-x86_64.tar.gz && cd garudachain-1.0/bin/</p>
            <p className="text-gray-500 mt-3 mb-1"># 2. Start node & sync</p>
            <p className="text-emerald-400">$ ./garudad -daemon -addnode=103.144.213.11:9333</p>
            <p className="text-gray-500 mt-3 mb-1"># 3. Create wallet</p>
            <p className="text-emerald-400">$ ./garuda-cli createwallet "mywallet"</p>
            <p className="text-emerald-400">$ ./garuda-cli getnewaddress "mining" "bech32"</p>
            <p className="text-gray-500 mt-3 mb-1"># 4. Start mining!</p>
            <p className="text-emerald-400">$ ./garuda-cli generatetoaddress 0 "grd1qYourAddress" 99999999</p>
            <p className="text-gray-500 mt-3 mb-1"># 5. Cek saldo</p>
            <p className="text-emerald-400">$ ./garuda-cli getbalance</p>
          </div>
        </div>

        {/* Specifications */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            {t("mining.specs")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t("mining.algorithm"), value: miningStats?.algorithm ?? "SHA-256d" },
              { label: t("mining.block_time"), value: `${blockTime}s` },
              { label: t("mining.block_subsidy_label"), value: `${blockReward} GRD` },
              { label: "Version", value: miningStats?.version ?? "-" },
              { label: t("mining.apbn_split"), value: "1%" },
              { label: t("mining.max_block_size"), value: "16 MB" },
              { label: t("mining.tx_fee_transfer"), value: "Rp 100" },
              { label: t("mining.consensus"), value: "Proof of Work" },
            ].map(spec => (
              <div key={spec.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">{spec.label}</p>
                <p className="text-[13px] font-bold text-foreground mt-1">{spec.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-amber-700">
              <strong>{t("saham.regulatory_title")}:</strong> {t("mining.disclaimer")}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
