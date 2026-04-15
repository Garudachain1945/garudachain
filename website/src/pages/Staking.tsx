import { Layout } from "@/components/Layout";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { Lock, TrendingUp, Shield, Clock, Users, Layers, CheckCircle2, Zap, BarChart3, Gift, AlertTriangle } from "lucide-react";

interface StakingPool {
  name: string;
  type: "flexible" | "locked";
  lockPeriod: string;
  apr: number;
  totalStaked: number;
  stakers: number;
  minStake: number;
  status: "active" | "full" | "upcoming";
  reward: string;
}

const STAKING_POOLS: StakingPool[] = [
  { name: "GRD Flexible Staking", type: "flexible", lockPeriod: "Tanpa lock", apr: 3.5, totalStaked: 5000000, stakers: 12400, minStake: 10, status: "active", reward: "GRD" },
  { name: "GRD 30-Day Lock", type: "locked", lockPeriod: "30 hari", apr: 5.2, totalStaked: 8500000, stakers: 8900, minStake: 100, status: "active", reward: "GRD" },
  { name: "GRD 90-Day Lock", type: "locked", lockPeriod: "90 hari", apr: 7.8, totalStaked: 12000000, stakers: 5600, minStake: 500, status: "active", reward: "GRD" },
  { name: "GRD 180-Day Lock", type: "locked", lockPeriod: "180 hari", apr: 10.5, totalStaked: 6500000, stakers: 2800, minStake: 1000, status: "active", reward: "GRD" },
  { name: "GRD 365-Day Lock", type: "locked", lockPeriod: "365 hari", apr: 14.0, totalStaked: 3200000, stakers: 950, minStake: 5000, status: "active", reward: "GRD" },
  { name: "APBN Patriot Staking", type: "locked", lockPeriod: "365 hari", apr: 8.0, totalStaked: 15000000, stakers: 18500, minStake: 10, status: "active", reward: "GRD + APBN Reward" },
  { name: "Validator Node Staking", type: "locked", lockPeriod: "180 hari", apr: 12.0, totalStaked: 25000000, stakers: 150, minStake: 50000, status: "active", reward: "GRD + Block Fee" },
  { name: "LP Staking (GRD/IDR-T)", type: "locked", lockPeriod: "30 hari", apr: 18.5, totalStaked: 8000000, stakers: 3200, minStake: 100, status: "active", reward: "GRD + LP Fee" },
];

export function Staking() {
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 15000 } });
  const latestBlock = stats?.latestBlock ?? 0;
  const totalSupply = latestBlock * 0.01;

  const totalStaked = STAKING_POOLS.reduce((s, p) => s + p.totalStaked, 0);
  const totalStakers = STAKING_POOLS.reduce((s, p) => s + p.stakers, 0);
  const avgAPR = STAKING_POOLS.reduce((s, p) => s + p.apr, 0) / STAKING_POOLS.length;
  const stakingRatio = totalSupply > 0 ? (totalStaked / (totalSupply + 3000000) * 100) : 0;

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Lock className="w-7 h-7" />
            <h1 className="text-2xl font-bold">GRD Staking</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Stake GRD untuk mendapatkan reward pasif. Pilih dari berbagai pool dengan APR yang berbeda.
            Semakin lama lock period, semakin tinggi reward. Mendukung keamanan dan stabilitas jaringan GarudaChain.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Staked</p>
            <p className="text-[18px] font-bold text-primary">{formatNumber(totalStaked)} GRD</p>
            <p className="text-[11px] text-muted-foreground">= Rp {formatNumber(totalStaked * 1000)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Stakers</p>
            <p className="text-[18px] font-bold text-foreground">{formatNumber(totalStakers)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Avg APR</p>
            <p className="text-[18px] font-bold text-emerald-600">{avgAPR.toFixed(1)}%</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Staking Ratio</p>
            <p className="text-[18px] font-bold text-foreground">{stakingRatio.toFixed(1)}%</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Active Pools</p>
            <p className="text-[18px] font-bold text-foreground">{STAKING_POOLS.length}</p>
          </div>
        </div>

        {/* Calculator */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Kalkulator Reward Staking
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { amount: 1000, label: "1.000 GRD" },
              { amount: 10000, label: "10.000 GRD" },
              { amount: 100000, label: "100.000 GRD" },
              { amount: 1000000, label: "1.000.000 GRD" },
            ].map(calc => (
              <div key={calc.amount} className="bg-gray-50 rounded-lg p-3">
                <p className="text-[12px] font-semibold text-foreground mb-2">Stake: {calc.label}</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Flexible (3.5%)</span>
                    <span className="font-semibold text-emerald-600">+{(calc.amount * 0.035 / 12).toFixed(1)} GRD/bln</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90-Day (7.8%)</span>
                    <span className="font-semibold text-emerald-600">+{(calc.amount * 0.078 / 12).toFixed(1)} GRD/bln</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">365-Day (14%)</span>
                    <span className="font-semibold text-emerald-600">+{(calc.amount * 0.14 / 12).toFixed(1)} GRD/bln</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pool Cards */}
        <h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Staking Pools
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {STAKING_POOLS.map(pool => (
            <div key={pool.name} className="bg-white border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-[14px] font-bold text-foreground">{pool.name}</h4>
                  <p className="text-[11px] text-muted-foreground">{pool.reward}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                    pool.type === "flexible" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}>
                    {pool.type === "flexible" ? "Flexible" : `Lock ${pool.lockPeriod}`}
                  </span>
                  <span className="bg-emerald-100 text-emerald-700 text-[11px] px-2 py-0.5 rounded font-semibold">Active</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">APR</p>
                  <p className="text-[16px] font-bold text-emerald-600">{pool.apr}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Staked</p>
                  <p className="text-[13px] font-semibold">{formatNumber(pool.totalStaked)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stakers</p>
                  <p className="text-[13px] font-semibold">{formatNumber(pool.stakers)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Min. Stake</p>
                  <p className="text-[13px] font-semibold">{formatNumber(pool.minStake)} GRD</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold py-2 rounded-lg transition-colors text-[13px]">
                  Stake
                </button>
                <button className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors">
                  Detail
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Special: APBN Patriot */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-2 flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" />
            APBN Patriot Staking — Kontribusi untuk Negara
          </h3>
          <p className="text-[12px] text-muted-foreground mb-3">
            Stake GRD di pool khusus yang hasilnya sebagian dialokasikan untuk pembangunan nasional.
            Staker mendapatkan APR 8% + badge "Patriot" on-chain + prioritas akses fitur baru GarudaChain.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Staked", value: "15,000,000 GRD" },
              { label: "Kontribusi APBN", value: "600,000 GRD (4%)" },
              { label: "Patriot Stakers", value: "18,500 orang" },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-lg p-3">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="text-[13px] font-bold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3">Cara Kerja Staking GRD</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { step: "1", title: "Pilih Pool", desc: "Pilih pool staking sesuai lock period dan APR yang diinginkan" },
              { step: "2", title: "Stake GRD", desc: "Kirim GRD ke smart contract staking. Dana terkunci sesuai periode" },
              { step: "3", title: "Earn Reward", desc: "Reward GRD didistribusikan setiap hari secara otomatis via smart contract" },
              { step: "4", title: "Unstake", desc: "Setelah lock period selesai, tarik GRD + reward ke wallet Anda" },
            ].map(item => (
              <div key={item.step} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                  {item.step}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-amber-700">
              <strong>Risiko Staking:</strong> Token yang di-stake terkunci selama lock period dan tidak bisa ditarik lebih awal.
              APR bersifat variabel dan dapat berubah sesuai kondisi jaringan. Staking melibatkan risiko smart contract.
              Pastikan Anda memahami risiko sebelum melakukan staking.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
