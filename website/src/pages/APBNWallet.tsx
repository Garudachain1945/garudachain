import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetNetworkStats, useGetLatestBlocks } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatNumber, formatTimeAgo } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { Landmark, Shield, Layers, BarChart3, PiggyBank, Building2, CheckCircle2 } from "lucide-react";

interface ApbnData {
  address: string;
  balance: number;
  expectedBalance: number;
  totalBlocks: number;
  apbnPerBlock: number;
  blockReward: number;
}

export function APBNWallet() {
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 10000 } });
  const { data: blocks } = useGetLatestBlocks({ limit: 20 }, { query: { refetchInterval: 10000 } });

  const [apbnData, setApbnData] = useState<ApbnData | null>(null);

  useEffect(() => {
    const fetchApbn = () => {
      fetch(apiUrl("/api/blockchain/apbn"))
        .then(res => res.json())
        .then(data => setApbnData(data))
        .catch(err => console.error("Failed to fetch APBN data:", err));
    };
    fetchApbn();
    const interval = setInterval(fetchApbn, 10000);
    return () => clearInterval(interval);
  }, []);

  const latestBlock = apbnData?.totalBlocks ?? stats?.latestBlock ?? 0;
  const apbnTotal = apbnData?.balance ?? 0;
  const apbnPerBlock = apbnData?.apbnPerBlock ?? 0.0001;
  const apbnAddress = apbnData?.address ?? "Loading...";
  const apbnRupiah = apbnTotal * 1000;

  const blockList = blocks && Array.isArray(blocks) ? blocks : [];

  // Simulate APBN accumulation milestones
  const milestones = [
    { block: 100000, amount: 100000 * 0.001, date: "2025-08-01" },
    { block: 500000, amount: 500000 * 0.001, date: "2025-12-15" },
    { block: 1000000, amount: 1000000 * 0.001, date: "2026-04-01" },
    { block: 5000000, amount: 5000000 * 0.001, date: "2027-06-01" },
    { block: 10000000, amount: 10000000 * 0.001, date: "2028-12-01" },
  ].filter(m => m.block <= latestBlock + 5000000);

  // Simulate allocation categories
  const alokasi = [
    { kategori: "Pendidikan", persen: 20, color: "bg-blue-500" },
    { kategori: "Kesehatan", persen: 15, color: "bg-emerald-500" },
    { kategori: "Infrastruktur Digital", persen: 25, color: "bg-purple-500" },
    { kategori: "Subsidi UMKM", persen: 15, color: "bg-amber-500" },
    { kategori: "Riset & Teknologi", persen: 10, color: "bg-red-500" },
    { kategori: "Cadangan Negara", persen: 15, color: "bg-gray-500" },
  ];

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Landmark className="w-7 h-7" />
            <h1 className="text-2xl font-bold">APBN Wallet Tracker</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Melacak akumulasi dana APBN dari 1% block reward GarudaChain. Setiap block yang ditambang,
            0.0001 GRD (= Rp 0.1) otomatis masuk ke APBN Wallet untuk kepentingan negara.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Main Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-5">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total APBN Terkumpul</p>
            <p className="text-2xl font-bold text-primary">{formatNumber(apbnTotal.toFixed(1))} GRD</p>
            <p className="text-[12px] text-muted-foreground mt-1">= Rp {formatNumber(apbnRupiah.toFixed(0))}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-5">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">APBN per Block</p>
            <p className="text-2xl font-bold text-foreground">{apbnPerBlock} GRD</p>
            <p className="text-[12px] text-muted-foreground mt-1">= Rp 0.1 per block</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-5">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Blocks</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(latestBlock)}</p>
            <p className="text-[12px] text-muted-foreground mt-1">yang berkontribusi ke APBN</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-5">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Persentase dari Supply</p>
            <p className="text-2xl font-bold text-foreground">1%</p>
            <p className="text-[12px] text-muted-foreground mt-1">dari setiap block reward</p>
          </div>
        </div>

        {/* APBN Wallet Address */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Alamat APBN Wallet (On-Chain)
          </h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] text-muted-foreground">Wallet Address:</span>
              <span className="text-[13px] font-mono text-primary font-semibold">{apbnAddress}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Balance</p>
                <p className="text-[14px] font-bold text-foreground">{formatNumber(apbnTotal.toFixed(1))} GRD</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Total TX Masuk</p>
                <p className="text-[14px] font-bold text-foreground">{formatNumber(latestBlock)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">TX Pertama</p>
                <p className="text-[14px] font-bold text-foreground">Block #1</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">TX Terakhir</p>
                <p className="text-[14px] font-bold text-foreground">Block #{formatNumber(latestBlock)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Left: Alokasi */}
          <div className="lg:col-span-2">
            {/* Mekanisme */}
            <div className="bg-white border border-border rounded-lg p-5 mb-6">
              <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Mekanisme APBN On-Chain
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-[12px] font-bold text-emerald-800 mb-1">1. Mining Block</p>
                  <p className="text-[11px] text-emerald-700">Miner menemukan block baru → reward 0.01 GRD</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-[12px] font-bold text-blue-800 mb-1">2. Auto-Split</p>
                  <p className="text-[11px] text-blue-700">99% (0.0099 GRD) → Miner, 1% (0.0001 GRD) → APBN</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-[12px] font-bold text-purple-800 mb-1">3. Akumulasi</p>
                  <p className="text-[11px] text-purple-700">Dana APBN terakumulasi otomatis setiap block baru</p>
                </div>
              </div>
            </div>

            {/* Rencana Alokasi */}
            <div className="bg-white border border-border rounded-lg p-5">
              <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-primary" />
                Rencana Alokasi Dana APBN Digital
              </h3>
              <div className="space-y-3">
                {alokasi.map((a) => (
                  <div key={a.kategori}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium text-foreground">{a.kategori}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-foreground">{a.persen}%</span>
                        <span className="text-[11px] text-muted-foreground">
                          ({formatNumber((apbnTotal * a.persen / 100).toFixed(1))} GRD)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`${a.color} h-2 rounded-full`} style={{ width: `${a.persen}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">
                * Alokasi ditentukan oleh DPR melalui smart contract governance. Perubahan alokasi memerlukan
                persetujuan multisig dari 5 kementerian terkait.
              </p>
            </div>
          </div>

          {/* Right: Recent blocks contributing */}
          <div className="space-y-6">
            <div className="bg-white border border-border rounded-lg p-5">
              <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Proyeksi APBN
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Per Jam (~720 block)", value: `${(720 * 0.0001).toFixed(4)} GRD`, rp: "Rp 72" },
                  { label: "Per Hari (~17.280 block)", value: `${(17280 * 0.0001).toFixed(2)} GRD`, rp: "Rp 1.728" },
                  { label: "Per Bulan (~518.400 block)", value: `${(518400 * 0.0001).toFixed(1)} GRD`, rp: "Rp 51.840" },
                  { label: "Per Tahun (~6.307.200 block)", value: `${(6307200 * 0.0001).toFixed(1)} GRD`, rp: "Rp 630.720" },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                    <span className="text-[12px] text-muted-foreground">{item.label}</span>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold text-foreground">{item.value}</p>
                      <p className="text-[10px] text-muted-foreground">{item.rp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-border rounded-lg p-5">
              <h3 className="text-[14px] font-bold text-foreground mb-3">Block Terbaru → APBN</h3>
              <div className="space-y-2">
                {blockList.slice(0, 10).map(block => (
                  <div key={block.number} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div>
                      <Link href={`/block/${block.number}`} className="text-[12px] text-primary hover:underline font-semibold">
                        #{formatNumber(block.number)}
                      </Link>
                      <p className="text-[10px] text-muted-foreground">{formatTimeAgo(block.timestamp)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-emerald-600">+{apbnPerBlock} GRD</p>
                      <p className="text-[10px] text-muted-foreground">→ APBN</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-border rounded-lg p-5">
              <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Transparansi
              </h3>
              <ul className="space-y-2">
                {[
                  "Setiap transaksi APBN tercatat on-chain dan bisa diaudit publik",
                  "Dana hanya bisa dicairkan melalui multisig governance",
                  "Laporan penggunaan dana dipublikasikan setiap kuartal",
                  "BPK melakukan audit on-chain secara berkala",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[12px] text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
