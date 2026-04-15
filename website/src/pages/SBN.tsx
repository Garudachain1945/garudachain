import { Layout } from "@/components/Layout";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  Cpu, Brain, Cog, Rocket, Globe, Shield, TrendingUp,
  ChevronRight, Zap, Code2, Database, Network
} from "lucide-react";

interface ProyekItem {
  kode: string;
  nama: string;
  kategori: "AI" | "Engineering" | "Blockchain" | "IoT";
  status: "active" | "development" | "planned";
  progress: number;
  target: string;
  deskripsi: string;
}

const PROYEK_LIST: ProyekItem[] = [
  {
    kode: "AI-001",
    nama: "GarudaAI — Large Language Model Indonesia",
    kategori: "AI",
    status: "active",
    progress: 65,
    target: "2027",
    deskripsi: "Pengembangan LLM berbasis bahasa Indonesia untuk edukasi, pemerintahan, dan industri.",
  },
  {
    kode: "AI-002",
    nama: "DeepVision Indonesia — Computer Vision",
    kategori: "AI",
    status: "development",
    progress: 40,
    target: "2028",
    deskripsi: "Sistem computer vision untuk smart city, pertanian presisi, dan keamanan nasional.",
  },
  {
    kode: "ENG-001",
    nama: "GarudaChain Consensus v2 — PoS Migration",
    kategori: "Blockchain",
    status: "active",
    progress: 55,
    target: "2027",
    deskripsi: "Migrasi konsensus dari PoW ke Proof-of-Stake untuk efisiensi energi dan skalabilitas.",
  },
  {
    kode: "ENG-002",
    nama: "GarudaVM — Smart Contract Runtime",
    kategori: "Engineering",
    status: "development",
    progress: 30,
    target: "2028",
    deskripsi: "Virtual machine untuk eksekusi smart contract dengan performa tinggi, kompatibel EVM & SVM.",
  },
  {
    kode: "IOT-001",
    nama: "GarudaNet — Decentralized IoT Network",
    kategori: "IoT",
    status: "planned",
    progress: 10,
    target: "2029",
    deskripsi: "Jaringan IoT terdesentralisasi untuk infrastruktur smart city di 10 kota besar Indonesia.",
  },
  {
    kode: "AI-003",
    nama: "NusantaraGPT — Multilingual AI Assistant",
    kategori: "AI",
    status: "planned",
    progress: 15,
    target: "2029",
    deskripsi: "AI assistant multilingual yang mendukung 700+ bahasa daerah Indonesia.",
  },
  {
    kode: "ENG-003",
    nama: "GarudaBridge — Cross-Chain Interoperability",
    kategori: "Engineering",
    status: "development",
    progress: 45,
    target: "2027",
    deskripsi: "Bridge untuk interoperabilitas antara GarudaChain dengan Ethereum, Solana, dan Polygon.",
  },
  {
    kode: "ENG-004",
    nama: "ZK-Garuda — Zero Knowledge Proof Layer",
    kategori: "Engineering",
    status: "planned",
    progress: 5,
    target: "2030",
    deskripsi: "Layer privasi berbasis zero-knowledge proof untuk transaksi konfidensial di GarudaChain.",
  },
];

const KATEGORI_ICON: Record<string, typeof Cpu> = {
  AI: Brain,
  Engineering: Cog,
  Blockchain: Database,
  IoT: Network,
};

const KATEGORI_COLOR: Record<string, string> = {
  AI: "bg-purple-100 text-purple-700",
  Engineering: "bg-blue-100 text-blue-700",
  Blockchain: "bg-red-100 text-red-700",
  IoT: "bg-emerald-100 text-emerald-700",
};

export function SBN() {
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 15000 } });
  const latestBlock = stats?.latestBlock ?? 0;
  const { t } = useI18n();

  const activeCount = PROYEK_LIST.filter(p => p.status === "active").length;
  const devCount = PROYEK_LIST.filter(p => p.status === "development").length;
  const avgProgress = Math.round(PROYEK_LIST.reduce((s, p) => s + p.progress, 0) / PROYEK_LIST.length);

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Rocket className="w-7 h-7" />
            <h1 className="text-2xl font-bold">{t("sbn.title")}</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">{t("sbn.subtitle")}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Vision Banner */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-5 mb-6">
          <div className="flex items-start gap-3">
            <Brain className="w-6 h-6 text-purple-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] font-bold text-purple-800 mb-1">Visi Indonesia Maju 2030</p>
              <p className="text-[12px] text-purple-700 leading-relaxed">
                GarudaChain mendukung transformasi digital Indonesia melalui pengembangan teknologi AI dan engineering.
                Proyek-proyek ini dibangun di atas infrastruktur blockchain GarudaChain untuk transparansi, akuntabilitas,
                dan desentralisasi — menuju Indonesia sebagai pusat inovasi teknologi Asia Tenggara.
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Proyek</p>
            <p className="text-[18px] font-bold text-foreground">{PROYEK_LIST.length}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Aktif</p>
            <p className="text-[18px] font-bold text-emerald-600">{activeCount}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Development</p>
            <p className="text-[18px] font-bold text-blue-600">{devCount}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Avg. Progress</p>
            <p className="text-[18px] font-bold text-foreground">{avgProgress}%</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Block Height</p>
            <p className="text-[18px] font-bold text-foreground">{formatNumber(latestBlock)}</p>
          </div>
        </div>

        {/* Pillars */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Pilar Teknologi GarudaChain 2030
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { icon: Brain, title: "Artificial Intelligence", desc: "LLM, Computer Vision, NLP untuk bahasa Indonesia dan daerah", color: "text-purple-600" },
              { icon: Cog, title: "Engineering", desc: "Blockchain infrastructure, VM, cross-chain bridges, ZK proof", color: "text-blue-600" },
              { icon: Code2, title: "Developer Ecosystem", desc: "SDK, API, tools untuk developer membangun di GarudaChain", color: "text-amber-600" },
              { icon: Globe, title: "Adopsi Nasional", desc: "Smart city, e-government, fintech, IoT terintegrasi blockchain", color: "text-emerald-600" },
            ].map(item => (
              <div key={item.title} className="flex gap-3">
                <item.icon className={`w-5 h-5 ${item.color} shrink-0 mt-0.5`} />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Project Cards */}
        <h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          Daftar Proyek
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {PROYEK_LIST.map((proyek) => {
            const Icon = KATEGORI_ICON[proyek.kategori] || Cpu;
            const colorClass = KATEGORI_COLOR[proyek.kategori] || "bg-gray-100 text-gray-700";
            return (
              <div key={proyek.kode} className="bg-white border border-border rounded-lg p-5 hover:shadow-md hover:border-primary/30 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-gray-50 border border-border flex items-center justify-center">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <span className="text-[11px] font-mono text-muted-foreground">{proyek.kode}</span>
                      <span className={`${colorClass} px-2 py-0.5 rounded text-[10px] font-semibold ml-2`}>
                        {proyek.kategori}
                      </span>
                    </div>
                  </div>
                  {proyek.status === "active" ? (
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aktif
                    </span>
                  ) : proyek.status === "development" ? (
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-semibold">Development</span>
                  ) : (
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-semibold">Planned</span>
                  )}
                </div>
                <h4 className="text-[13px] font-bold text-foreground mb-1">{proyek.nama}</h4>
                <p className="text-[12px] text-muted-foreground mb-3">{proyek.deskripsi}</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        proyek.progress >= 50 ? "bg-emerald-500" : proyek.progress >= 25 ? "bg-blue-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${proyek.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-foreground">{proyek.progress}%</span>
                  <span className="text-[10px] text-muted-foreground">Target: {proyek.target}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Roadmap */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Roadmap 2025 — 2030
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                year: "2025-2026", title: "Foundation",
                items: ["GarudaChain Mainnet stable", "GarudaAI LLM v1 launch", "GarudaBridge alpha", "Developer SDK & API"],
                color: "border-emerald-200 bg-emerald-50",
              },
              {
                year: "2027-2028", title: "Growth",
                items: ["PoS migration complete", "GarudaVM launch", "DeepVision pilot di 3 kota", "Cross-chain interoperability"],
                color: "border-blue-200 bg-blue-50",
              },
              {
                year: "2029-2030", title: "Scale",
                items: ["NusantaraGPT 700+ bahasa", "IoT network 10 kota", "ZK-Garuda privacy layer", "Full Indonesia Maju integration"],
                color: "border-purple-200 bg-purple-50",
              },
            ].map(phase => (
              <div key={phase.year} className={`${phase.color} border rounded-lg p-4`}>
                <p className="text-[11px] font-mono font-bold text-foreground mb-1">{phase.year}</p>
                <p className="text-[13px] font-bold text-foreground mb-2">{phase.title}</p>
                <ul className="space-y-1.5">
                  {phase.items.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[12px] text-foreground">
                      <ChevronRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {[
            { icon: Shield, title: "Open Source", desc: "Semua proyek bersifat open source dan dapat diaudit oleh komunitas.", color: "text-emerald-600" },
            { icon: Database, title: "On-Chain Governance", desc: "Keputusan proyek diambil melalui voting on-chain oleh holder GRD.", color: "text-blue-600" },
            { icon: Globe, title: "Kolaborasi Global", desc: "Kemitraan dengan universitas dan perusahaan teknologi global.", color: "text-purple-600" },
          ].map(item => (
            <div key={item.title} className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <item.icon className={`w-4 h-4 ${item.color}`} />
                <p className="text-[13px] font-bold text-foreground">{item.title}</p>
              </div>
              <p className="text-[12px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="bg-gray-50 border border-border rounded-lg p-4">
          <p className="text-[12px] text-muted-foreground">
            <strong>Disclaimer:</strong> Proyek Indonesia Maju 2030 adalah inisiatif pengembangan teknologi yang dibangun di atas
            infrastruktur GarudaChain. Semua progress dan milestone dipublikasikan secara transparan di blockchain.
            Kontribusi dan partisipasi terbuka untuk seluruh komunitas developer Indonesia.
          </p>
        </div>
      </div>
    </Layout>
  );
}
