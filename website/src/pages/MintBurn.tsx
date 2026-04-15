import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetLatestBlocks } from "@workspace/api-client-react";
import { formatNumber, formatTimeAgo } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { Link } from "wouter";
import { Flame, Plus, Minus, Shield, Layers, AlertTriangle, BarChart3, CheckCircle2, ArrowDown, ArrowUp, Activity, Landmark, Globe, ExternalLink } from "lucide-react";
import { AssetLogo } from "@/components/AssetLogo";
import { UpdateLogoForm } from "@/components/UpdateLogoForm";

interface SupplyData {
  totalMined: number;
  circulatingSupply: number;
  blockHeight: number;
  apbnTotal: number;
  minerTotal: number;
  apbnPerBlock: number;
  minerPerBlock: number;
  blockReward: number;
}

interface Stablecoin {
  symbol: string;
  name: string;
  assetId: string;
  totalSupply: number;
  outstanding: number;
  holders: number;
  transfers: number;
  pegCurrency: string;
  pegRate: number;
  issueHeight: number;
  issueTxid: string;
  status: string;
}

// Supported peg currencies for future stablecoin issuance
const SUPPORTED_CURRENCIES = [
  { code: "IDR", name: "Rupiah Indonesia", flag: "🇮🇩", symbol: "Rp" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸", symbol: "$" },
  { code: "EUR", name: "Euro", flag: "🇪🇺", symbol: "\u20AC" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵", symbol: "\u00A5" },
  { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬", symbol: "S$" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳", symbol: "\u00A5" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧", symbol: "\u00A3" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺", symbol: "A$" },
  { code: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾", symbol: "RM" },
  { code: "THB", name: "Thai Baht", flag: "🇹🇭", symbol: "\u0E3F" },
];

export function MintBurn() {
  const [supply, setSupply] = useState<SupplyData | null>(null);
  const [stablecoins, setStablecoins] = useState<Stablecoin[]>([]);
  const { data: blocks } = useGetLatestBlocks({ limit: 10 }, { query: { refetchInterval: 10000 } });

  useEffect(() => {
    const fetchSupply = () => {
      fetch(apiUrl("/api/blockchain/supply"))
        .then(res => res.json())
        .then(data => setSupply(data))
        .catch(() => {});
    };
    fetchSupply();
    const interval = setInterval(fetchSupply, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchStablecoins = () => {
      fetch(apiUrl("/api/blockchain/stablecoins"))
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setStablecoins(data); })
        .catch(() => {});
    };
    fetchStablecoins();
    const interval = setInterval(fetchStablecoins, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalMinted = supply?.totalMined ?? 0;
  const circulatingSupply = supply?.circulatingSupply ?? 0;

  const blockList = blocks && Array.isArray(blocks) ? blocks : [];

  // Real mining events from recent blocks (no fake policy_mint/burn entries)
  // Type is a union to support future policy_mint/burn events in the template
  const events: Array<{ type: "mint" | "policy_mint" | "burn"; amount: number; block: number; time: string; reason: string; by: string }> = blockList.slice(0, 10).map((b: any) => ({
    type: "mint" as const,
    amount: supply?.blockReward ?? 0.01,
    block: b.number,
    time: b.timestamp,
    reason: "Block Reward Mining",
    by: "Coinbase (PoW)",
  }));

  // No policy mints or burns yet in this early stage
  const policyMinted = 0;
  const policyBurned = 0;

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-7 h-7" />
            <h1 className="text-2xl font-bold">Mint & Burn GRD</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Mekanisme penerbitan (Mint) dan penarikan (Burn) token GRD di GarudaChain.
            Operasi mint/burn dilakukan melalui governance on-chain dengan 5-Layer MuSig2 Schnorr Signature.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Supply Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Plus className="w-4 h-4 text-emerald-600" />
              <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">Total Minted</p>
            </div>
            <p className="text-xl font-bold text-emerald-800">{formatNumber(Math.round(totalMinted + policyMinted))} GRD</p>
            <p className="text-[11px] text-emerald-600 mt-1">Mining + Kebijakan BI</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Minus className="w-4 h-4 text-red-600" />
              <p className="text-[11px] text-red-700 font-semibold uppercase tracking-wide">Total Burned</p>
            </div>
            <p className="text-xl font-bold text-red-800">{formatNumber(policyBurned)} GRD</p>
            <p className="text-[11px] text-red-600 mt-1">Kontraksi Moneter</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-blue-600" />
              <p className="text-[11px] text-blue-700 font-semibold uppercase tracking-wide">Circulating Supply</p>
            </div>
            <p className="text-xl font-bold text-blue-800">{formatNumber(Math.round(circulatingSupply))} GRD</p>
            <p className="text-[11px] text-blue-600 mt-1">= Rp {formatNumber(Math.round(circulatingSupply * 1000))}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-foreground" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Max Supply</p>
            </div>
            <p className="text-xl font-bold text-foreground">Tidak Terbatas</p>
            <p className="text-[11px] text-muted-foreground mt-1">Governance on-chain</p>
          </div>
        </div>

        {/* Sumber Supply */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Dua Sumber Penerbitan GRD
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h4 className="text-[14px] font-bold text-emerald-800 mb-2 flex items-center gap-2">
                <ArrowUp className="w-4 h-4" /> 1. Mining (Proof of Work)
              </h4>
              <p className="text-[12px] text-emerald-700 mb-3">
                Setiap block yang ditambang menghasilkan 0.01 GRD baru. Ini adalah mekanisme penerbitan otomatis
                yang berjalan terus-menerus seiring block baru ditemukan (~5 detik/block).
              </p>
              <div className="bg-white rounded-lg p-3 space-y-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Block Reward</span><span className="font-semibold">0.01 GRD/block</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Miner (99%)</span><span className="font-semibold">0.0099 GRD</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">APBN (1%)</span><span className="font-semibold">0.0001 GRD</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total dari Mining</span><span className="font-semibold">{formatNumber(totalMinted.toFixed(1))} GRD</span></div>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-[14px] font-bold text-blue-800 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" /> 2. Governance On-Chain
              </h4>
              <p className="text-[12px] text-blue-700 mb-3">
                Governance council dapat menerbitkan (mint) atau menarik (burn) GRD melalui voting on-chain.
                Proses ini memerlukan 5-Layer MuSig2 Schnorr Signature dari 5 pejabat BI.
              </p>
              <div className="bg-white rounded-lg p-3 space-y-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Policy Minted</span><span className="font-semibold text-emerald-600">+{formatNumber(policyMinted)} GRD</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Policy Burned</span><span className="font-semibold text-red-600">-{formatNumber(policyBurned)} GRD</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Net Policy</span><span className="font-semibold">+{formatNumber(policyMinted - policyBurned)} GRD</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Otorisasi</span><span className="font-semibold">5-Layer MuSig2</span></div>
              </div>
            </div>
          </div>
        </div>


        {/* Event Log */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Riwayat Mint & Burn
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Type</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Reason</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">By</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Block</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((evt, idx) => (
                  <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3">
                      {evt.type === "burn" ? (
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 w-fit">
                          <ArrowDown className="w-3 h-3" /> BURN
                        </span>
                      ) : evt.type === "policy_mint" ? (
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 w-fit">
                          <ArrowUp className="w-3 h-3" /> POLICY MINT
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 w-fit">
                          <ArrowUp className="w-3 h-3" /> MINING
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      <span className={evt.type === "burn" ? "text-red-600" : "text-emerald-600"}>
                        {evt.type === "burn" ? "-" : "+"}{formatNumber(evt.amount)} GRD
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-[12px] max-w-[250px] truncate">{evt.reason}</td>
                    <td className="px-4 py-3 text-[12px]">
                      {evt.by.includes("MuSig2") ? (
                        <span className="flex items-center gap-1 text-blue-600 font-medium">
                          <Shield className="w-3 h-3" /> {evt.by}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{evt.by}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/block/${evt.block}`} className="text-primary hover:underline text-[12px]">
                        #{formatNumber(evt.block)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-[12px]">{formatTimeAgo(evt.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Skenario Kebijakan */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            Skenario Kebijakan Mint/Burn
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h4 className="text-[13px] font-bold text-emerald-800 mb-2">Stimulus Ekonomi (Mint)</h4>
              <p className="text-[12px] text-emerald-700 mb-2">Saat ekonomi memerlukan stimulus, BI bisa mint GRD baru:</p>
              <ul className="space-y-1">
                {["Resesi atau perlambatan ekonomi", "Bantuan sosial darurat", "Pembiayaan infrastruktur", "Likuiditas pasar keuangan"].map((i, idx) => (
                  <li key={idx} className="text-[11px] text-emerald-700 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> {i}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="text-[13px] font-bold text-red-800 mb-2">Kontraksi Inflasi (Burn)</h4>
              <p className="text-[12px] text-red-700 mb-2">Saat inflasi tinggi, BI bisa burn GRD dari peredaran:</p>
              <ul className="space-y-1">
                {["Inflasi melebihi target BI", "Bubble aset digital", "Stabilisasi nilai tukar GRD/IDR", "Mengurangi uang beredar"].map((i, idx) => (
                  <li key={idx} className="text-[11px] text-red-700 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> {i}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-[13px] font-bold text-amber-800 mb-2">Krisis Darurat</h4>
              <p className="text-[12px] text-amber-700 mb-2">Skenario darurat memerlukan tindakan cepat:</p>
              <ul className="space-y-1">
                {["Hard fork darurat untuk parameter baru", "Freeze wallet tertentu (AML/CFT)", "Emergency mint untuk bailout", "Penyesuaian block reward"].map((i, idx) => (
                  <li key={idx} className="text-[11px] text-amber-700 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* STABLECOIN MANAGEMENT SECTION */}
        {/* ============================================================ */}
        <div className="border-t-2 border-emerald-200 mt-8 pt-8 mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Penerbitan Stablecoin</h2>
              <p className="text-[12px] text-muted-foreground">Stablecoin diterbitkan oleh CBDC Authority — pegged 1:1 ke mata uang fiat</p>
            </div>
          </div>
        </div>

        {/* Stablecoin Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-4 h-4 text-emerald-600" />
              <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">Stablecoin Aktif</p>
            </div>
            <p className="text-xl font-bold text-emerald-800">{stablecoins.length}</p>
            <p className="text-[11px] text-emerald-600 mt-1">Mata uang di-peg</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">Total Supply</p>
            </div>
            <p className="text-xl font-bold text-emerald-800">
              {formatNumber(stablecoins.reduce((sum, s) => sum + s.totalSupply, 0))}
            </p>
            <p className="text-[11px] text-emerald-600 mt-1">Semua stablecoin</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-600" />
              <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">Total Holders</p>
            </div>
            <p className="text-xl font-bold text-emerald-800">
              {stablecoins.reduce((sum, s) => sum + s.holders, 0)}
            </p>
            <p className="text-[11px] text-emerald-600 mt-1">Pemegang stablecoin</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-emerald-600" />
              <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">Multi-Currency</p>
            </div>
            <p className="text-xl font-bold text-emerald-800">{SUPPORTED_CURRENCIES.length}</p>
            <p className="text-[11px] text-emerald-600 mt-1">Mata uang didukung</p>
          </div>
        </div>

        {/* Active Stablecoins Table */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-600" />
              Stablecoin Aktif di GarudaChain
            </h3>
            <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-semibold">
              Pegged 1:1
            </span>
          </div>
          {stablecoins.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Token</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Peg</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Total Supply</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Holders</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Transfers</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Issue Block</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Status</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stablecoins.map((sc) => {
                    const curr = SUPPORTED_CURRENCIES.find(c => c.code === sc.pegCurrency);
                    return (
                      <tr key={sc.assetId} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <AssetLogo symbol={sc.symbol} size={32} tipe="STABLECOIN" />
                            <div>
                              <p className="font-semibold text-foreground">{sc.symbol}</p>
                              <p className="text-[11px] text-muted-foreground">{sc.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                            1 {sc.symbol} = {curr?.symbol || ""}{sc.pegRate} {sc.pegCurrency}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(sc.totalSupply)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(sc.holders)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(sc.transfers)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/block/${sc.issueHeight}`} className="text-primary hover:underline">
                            #{formatNumber(sc.issueHeight)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link href={`/token/${sc.symbol}`} className="text-primary hover:text-primary/80">
                            <ExternalLink className="w-4 h-4 inline" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <Landmark className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground">Belum ada stablecoin yang diterbitkan</p>
              <p className="text-[11px] text-muted-foreground mt-1">Stablecoin diterbitkan oleh CBDC Authority melalui otorisasi 5-Layer MuSig2</p>
            </div>
          )}
        </div>


        {/* Update Logo */}
        <div className="mb-6">
          <UpdateLogoForm title="Update Logo Token" />
        </div>

        {/* Stablecoin Issuance Process */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            Proses Penerbitan Stablecoin
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: 1, title: "Proposal Penerbitan", desc: "CBDC Authority mengajukan proposal penerbitan stablecoin baru dengan spesifikasi mata uang, supply, dan mekanisme peg.", color: "emerald" },
              { step: 2, title: "Otorisasi MuSig2", desc: "5-Layer MuSig2 Schnorr Signature (3-of-5 threshold) dari pejabat BI untuk menyetujui penerbitan.", color: "blue" },
              { step: 3, title: "Issuance On-Chain", desc: "Token stablecoin diterbitkan di blockchain GarudaChain menggunakan OP_RETURN GAST dengan type STABLECOIN.", color: "teal" },
              { step: 4, title: "Distribusi & Monitoring", desc: "Stablecoin didistribusikan ke bank-bank dan dipantau peg-nya secara real-time melalui oracle on-chain.", color: "amber" },
            ].map(s => (
              <div key={s.step} className={`bg-${s.color}-50 border border-${s.color}-200 rounded-lg p-4`}>
                <div className={`w-8 h-8 rounded-full bg-${s.color}-200 text-${s.color}-700 flex items-center justify-center text-[13px] font-bold mb-2`}>
                  {s.step}
                </div>
                <h4 className={`text-[13px] font-bold text-${s.color}-800 mb-1`}>{s.title}</h4>
                <p className={`text-[11px] text-${s.color}-700`}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 border border-border rounded-lg p-4">
          <p className="text-[12px] text-muted-foreground">
            <strong>Catatan:</strong> Mekanisme mint/burn GRD melalui kebijakan moneter dan penerbitan stablecoin
            keduanya memerlukan otorisasi 5-Layer MuSig2 dari Governance Council.
            Mining menghasilkan GRD baru secara otomatis setiap block, sedangkan stablecoin diterbitkan
            secara terkontrol oleh CBDC Authority. Semua operasi tercatat permanen di blockchain
            dan bisa diaudit oleh publik untuk menjamin transparansi kebijakan moneter digital.
          </p>
        </div>
      </div>
    </Layout>
  );
}
