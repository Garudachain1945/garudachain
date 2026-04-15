import { Layout } from "@/components/Layout";
import { useGetNetworkStats, useGetLatestBlocks } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { Link } from "wouter";
import {
  Landmark,
  Coins,
  Globe,
  ArrowRight,
  TrendingUp,
  Layers,
  Building2,
  Wallet,
  Network,
} from "lucide-react";

export function Dashboard() {
  const { data: stats, isLoading } = useGetNetworkStats({ query: { refetchInterval: 10000 } });
  const { data: blocks } = useGetLatestBlocks({ limit: 10 }, { query: { refetchInterval: 10000 } });

  const latestBlock = stats?.latestBlock ?? 0;
  const totalSupply = latestBlock * 0.01;
  const apbnReserve = Math.floor(totalSupply * 0.01);
  const minerDistributed = totalSupply - apbnReserve;

  // Calculate avg block time from recent blocks
  let avgBlockTime = stats?.avgBlockTime ?? 0;
  if (Array.isArray(blocks) && blocks.length > 1) {
    const times = blocks.map((b) => new Date(b.timestamp).getTime());
    const diffs = times.slice(0, -1).map((t, i) => t - times[i + 1]);
    if (diffs.length > 0) avgBlockTime = diffs.reduce((a, b) => a + b, 0) / diffs.length / 1000;
  }

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center gap-3 mb-2">
            <Landmark className="w-7 h-7" />
            <h1 className="text-2xl md:text-3xl font-bold">GarudaChain Dashboard</h1>
          </div>
          <p className="text-white/70 text-sm">
            Monitor GRD Token — Statistik jaringan, supply, dan aktivitas blockchain GarudaChain
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl flex-1">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Total Supply",
              value: isLoading ? "..." : `${formatNumber(totalSupply)} GRD`,
              sub: `${formatNumber(latestBlock)} blocks mined`,
              icon: Coins,
              color: "text-primary",
            },
            {
              label: "APBN Reserve (1%)",
              value: isLoading ? "..." : `${formatNumber(apbnReserve)} GRD`,
              sub: "Alokasi APBN otomatis",
              icon: Building2,
              color: "text-amber-600",
            },
            {
              label: "Miner Distributed (99%)",
              value: isLoading ? "..." : `${formatNumber(minerDistributed)} GRD`,
              sub: "0.0099 GRD per block",
              icon: Wallet,
              color: "text-emerald-600",
            },
            {
              label: "Transaksi Total",
              value: isLoading ? "..." : formatNumber(stats?.totalTransactions ?? 0),
              sub: `TPS: ${stats?.tps?.toFixed(2) ?? "0"}`,
              icon: TrendingUp,
              color: "text-blue-600",
            },
          ].map((m) => (
            <div key={m.label} className="bg-white border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className={`w-4 h-4 ${m.color}`} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{m.label}</p>
              </div>
              <p className="text-[16px] font-bold text-foreground">{m.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Two Column: APBN Tracker + Supply Distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* APBN Tracker */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600" />
              APBN Tracker — Dana Negara
            </h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Setiap block yang ditambang mengalokasikan <strong>1% (0.0001 GRD)</strong> secara otomatis ke wallet APBN negara.
              Sejalan dengan konsep <strong>Proyek Garuda</strong> untuk integrasi GRD token dengan ekosistem keuangan digital.
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-muted-foreground">APBN Accumulated</span>
                  <span className="font-bold text-amber-600">{formatNumber(apbnReserve)} GRD</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: "1%" }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">1% dari total supply</p>
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-muted-foreground">Miner Rewards</span>
                  <span className="font-bold text-emerald-600">{formatNumber(minerDistributed)} GRD</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: "99%" }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">99% dari total supply</p>
              </div>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[11px] text-amber-800">
                <strong>Transparansi:</strong> Alokasi APBN tercatat permanen di blockchain dan dapat diaudit publik.
                Mekanisme ini <em>hardcoded</em> di protokol — tidak bisa diubah tanpa hard fork.
              </p>
            </div>
          </div>

          {/* Supply Distribution */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-foreground mb-4 flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" />
              Distribusi Supply GRD
            </h2>

            {/* Visual supply bar */}
            <div className="mb-4">
              <div className="flex rounded-lg overflow-hidden h-8 bg-gray-100">
                <div className="bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: "99%" }}>
                  Miner 99%
                </div>
                <div className="bg-amber-500 flex items-center justify-center text-white text-[9px] font-bold" style={{ width: "1%" }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Miner: {formatNumber(minerDistributed)} GRD</span>
                <span>APBN: {formatNumber(apbnReserve)} GRD</span>
              </div>
            </div>

            <div className="space-y-2 text-[12px]">
              {[
                { label: "Block Reward", value: "0.01 GRD / block (= Rp 10)" },
                { label: "Miner Reward", value: "0.0099 GRD (99%)" },
                { label: "APBN Allocation", value: "0.0001 GRD (1%)" },
                { label: "Peg Value", value: "1 GRD = Rp 1.000" },
                { label: "Block Height", value: isLoading ? "..." : formatNumber(latestBlock) },
                { label: "Total Supply", value: isLoading ? "..." : `${formatNumber(totalSupply)} GRD` },
                { label: "Max Supply", value: "Tidak Terbatas (Governance)" },
                { label: "Avg Block Time", value: avgBlockTime > 0 ? `${avgBlockTime.toFixed(1)} detik` : "..." },
              ].map((r) => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium text-foreground">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3i Framework — Live Connection */}
        <div className="bg-white border border-border rounded-lg p-5 shadow-sm mb-6">
          <h2 className="text-[15px] font-bold text-foreground mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Framework 3i — Pilar GarudaChain
          </h2>
          <p className="text-[12px] text-muted-foreground mb-4">
            Tiga pilar utama dari arsitektur GarudaChain yang dirancang dalam Proyek Garuda,
            diimplementasikan pada GarudaChain.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "Integrasi",
                icon: Layers,
                color: "border-red-200 bg-red-50",
                iconColor: "text-primary",
                features: [
                  "GRD & IDR-T stablecoin terintegrasi end-to-end",
                  "Koneksi dengan infrastruktur keuangan existing (BI-FAST, QRIS)",
                  "Model distribusi two-tier: BI → Bank → Masyarakat",
                  `Implementasi: ${formatNumber(stats?.totalTransactions ?? 0)} transaksi on-chain`,
                ],
              },
              {
                title: "Interoperabilitas",
                icon: Network,
                color: "border-blue-200 bg-blue-50",
                iconColor: "text-blue-600",
                features: [
                  "Lintas platform — compatible dengan ekosistem Bitcoin",
                  "GRD-20 token standard untuk aset digital",
                  "API Gateway untuk integrasi perbankan",
                  `Implementasi: ${formatNumber(stats?.totalAddresses ?? 0)} alamat aktif`,
                ],
              },
              {
                title: "Interkoneksi",
                icon: Globe,
                color: "border-emerald-200 bg-emerald-50",
                iconColor: "text-emerald-600",
                features: [
                  "Mendukung multi-chain settlement (cross-chain bridge)",
                  "Cross-border payment readiness",
                  "ASEAN Payment Connectivity",
                  `Implementasi: P2P Network port 9333`,
                ],
              },
            ].map((pillar) => (
              <div key={pillar.title} className={`border rounded-lg p-4 ${pillar.color}`}>
                <div className="flex items-center gap-2 mb-3">
                  <pillar.icon className={`w-5 h-5 ${pillar.iconColor}`} />
                  <h3 className="text-[14px] font-bold text-foreground">{pillar.title}</h3>
                </div>
                <ul className="space-y-2">
                  {pillar.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <span className={`font-bold mt-0.5 ${pillar.iconColor}`}>•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Arsitektur 3-Layer + 5-Layer Security */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* 3-Layer Technology */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-foreground mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Arsitektur Teknologi 3-Layer
            </h2>
            <div className="space-y-2">
              {[
                {
                  layer: "Layer 1",
                  name: "Core Ledger",
                  desc: "Bitcoin Core v28.1, SHA-256d PoW, UTXO model",
                  color: "bg-red-500",
                  bg: "bg-red-50 border-red-200",
                  status: `Block #${formatNumber(latestBlock)}`,
                },
                {
                  layer: "Layer 2",
                  name: "Platform Integrasi",
                  desc: "API Gateway, Cross-chain bridge, Oracle service",
                  color: "bg-blue-500",
                  bg: "bg-blue-50 border-blue-200",
                  status: "RPC Port 9446",
                },
                {
                  layer: "Layer 3",
                  name: "Use Case & Aplikasi",
                  desc: "Pembayaran retail, Settlement DvP/PvP, Tokenisasi",
                  color: "bg-emerald-500",
                  bg: "bg-emerald-50 border-emerald-200",
                  status: "GRD-20 Tokens",
                },
              ].map((l) => (
                <div key={l.layer} className={`border rounded-lg p-3 ${l.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${l.color}`}>
                        {l.layer}
                      </span>
                      <span className="text-[13px] font-bold text-foreground">{l.name}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white px-2 py-0.5 rounded border border-border">
                      {l.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-14">{l.desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Lihat Blocks", href: "/blocks", icon: Layers },
            { label: "Lihat Transaksi", href: "/txs", icon: ArrowRight },
            { label: "Whitepaper", href: "/whitepaper", icon: Globe },
            { label: "Network Status", href: "/network", icon: Network },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white border border-border rounded-lg p-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-all flex items-center gap-3 group"
            >
              <link.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
