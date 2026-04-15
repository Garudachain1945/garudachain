import { Layout } from "@/components/Layout";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { useState } from "react";

type TabId = "ringkasan" | "bab1" | "bab2" | "bab3" | "teknis";

export function Whitepaper() {
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 30000 } });
  const [activeTab, setActiveTab] = useState<TabId>("ringkasan");

  const tabs: { id: TabId; label: string }[] = [
    { id: "ringkasan", label: "Ringkasan Eksekutif" },
    { id: "bab1", label: "Bab 1: Dasar Pemikiran" },
    { id: "bab2", label: "Bab 2: Desain GRD" },
    { id: "bab3", label: "Bab 3: Peta Jalan" },
    { id: "teknis", label: "GarudaChain Teknis" },
  ];

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-center gap-4 mb-4">
            <img src="/garuda.svg" alt="Garuda" className="w-16 h-16 object-contain drop-shadow-lg" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Proyek Garuda: GarudaChain Whitepaper</h1>
              <p className="text-white/70 text-sm mt-1">
                Arsitektur Blockchain Berdaulat Indonesia — Mengadopsi Konsep Digital Currency Nasional
              </p>
              <p className="text-white/50 text-xs mt-1">
                Diimplementasikan pada GarudaChain Blockchain — v1.0
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-5xl flex-1">
        {/* Live Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Block Height", value: stats ? formatNumber(stats.latestBlock) : "..." },
            { label: "Total Transaksi", value: stats ? formatNumber(stats.totalTransactions) : "..." },
            { label: "Total Supply", value: stats ? `${formatNumber(stats.latestBlock * 0.01)} GRD` : "..." },
            { label: "Jaringan", value: "GarudaChain Mainnet" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-border rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{s.label}</p>
              <p className="text-[14px] font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 mb-6 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-[12px] font-semibold rounded-md transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="prose prose-sm max-w-none">

          {/* ========== RINGKASAN EKSEKUTIF ========== */}
          {activeTab === "ringkasan" && (
            <>
              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Ringkasan Eksekutif</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain mengadopsi dan mengimplementasikan arsitektur <strong>"Proyek Garuda"</strong> — sebuah
                  konsep digital currency nasional Indonesia — dalam bentuk blockchain publik berdaulat. Proyek ini
                  mengambil kerangka kerja yang dirancang untuk ekosistem keuangan digital Indonesia dan
                  mewujudkannya sebagai infrastruktur blockchain yang terbuka dan terdesentralisasi.
                </p>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GRD (Garuda Rupiah Digital) dirancang sebagai native token GarudaChain yang menjadi tulang punggung
                  ekosistem keuangan digital Indonesia. Visi utamanya adalah menyediakan infrastruktur blockchain
                  yang mendukung <strong>ekonomi dan keuangan digital</strong> secara end-to-end.
                </p>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  <strong>GarudaChain</strong> mengimplementasikan visi ini dalam bentuk blockchain berdaulat berbasis
                  Bitcoin Core v28.1 dengan native coin <strong>Garuda Rupiah Digital (GRD)</strong>, dilengkapi mekanisme keamanan
                  multi-signature governance untuk operasi on-chain.
                </p>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Tiga Pilar Desain: 3i</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  GarudaChain dibangun atas kerangka <strong>3i</strong> yang menjadi fondasi arsitektur keseluruhan:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      title: "Integrasi",
                      desc: "GRD sebagai instrumen pembayaran yang terintegrasi secara end-to-end antara wholesale dan retail, serta dengan infrastruktur keuangan yang sudah ada.",
                      icon: "1",
                    },
                    {
                      title: "Interoperabilitas",
                      desc: "Kemampuan GarudaChain untuk beroperasi lintas platform, lintas border, dan lintas instrumen keuangan, baik conventional maupun digital asset.",
                      icon: "2",
                    },
                    {
                      title: "Interkoneksi",
                      desc: "Konektivitas GarudaChain dengan ekosistem keuangan global, mendukung kolaborasi antar blockchain dan interkoneksi multi-chain internasional.",
                      icon: "3",
                    },
                  ].map((item) => (
                    <div key={item.title} className="bg-red-50 border border-red-100 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 bg-primary text-white rounded flex items-center justify-center text-[11px] font-bold">{item.icon}</span>
                        <h3 className="text-[14px] font-bold text-foreground">{item.title}</h3>
                      </div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Dua Varian GRD</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <h3 className="text-[14px] font-bold text-foreground mb-2">w-GRD (Wholesale)</h3>
                    <ul className="text-[12px] text-muted-foreground space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>Diterbitkan oleh GarudaChain governance untuk peserta pasar keuangan</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>Digunakan untuk transaksi antar-lembaga dan settlement pasar keuangan</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>Dapat digunakan sebagai underlying asset penerbitan r-GRD</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>Settlement dan operasi governance on-chain</span>
                      </li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                    <h3 className="text-[14px] font-bold text-foreground mb-2">r-GRD (Retail)</h3>
                    <ul className="text-[12px] text-muted-foreground space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Diterbitkan oleh lembaga keuangan berizin berdasarkan w-GRD</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Digunakan oleh masyarakat umum untuk transaksi harian</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Mendukung programmable money dan smart contract</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Interoperabel dengan aset digital dan keuangan konvensional</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ========== BAB 1: DASAR PEMIKIRAN ========== */}
          {activeTab === "bab1" && (
            <>
              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">1</span>
                  Lingkungan Strategis
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  Perkembangan digitalisasi ekonomi dan keuangan secara global telah membawa perubahan fundamental
                  dalam cara masyarakat bertransaksi. Beberapa faktor lingkungan strategis yang mendorong pengembangan
                  GarudaChain:
                </p>
                <div className="space-y-3">
                  {[
                    {
                      title: "Akselerasi Digitalisasi Ekonomi",
                      desc: "Pandemi COVID-19 mempercepat adopsi pembayaran digital. E-commerce dan ekonomi digital Indonesia diproyeksikan mencapai USD 146 miliar pada 2025. Kebutuhan infrastruktur pembayaran yang efisien semakin mendesak."
                    },
                    {
                      title: "Perkembangan Aset Kripto",
                      desc: "Pertumbuhan aset kripto dan stablecoin global menimbulkan kebutuhan akan blockchain berdaulat. Diperlukan infrastruktur blockchain yang sesuai dengan kebutuhan Indonesia dan mendukung kedaulatan digital."
                    },
                    {
                      title: "Tren Global Digital Currency",
                      desc: "Lebih dari 100 negara sedang mengeksplorasi digital currency. Tiongkok telah meluncurkan e-CNY, Eropa sedang mengembangkan Digital Euro. Indonesia perlu menyiapkan posisi strategis melalui GarudaChain."
                    },
                    {
                      title: "Inklusi Keuangan",
                      desc: "Masih terdapat segmen masyarakat yang belum terjangkau layanan keuangan formal. GarudaChain dapat menjadi infrastruktur untuk memperluas akses keuangan ke seluruh lapisan masyarakat."
                    },
                  ].map((item) => (
                    <div key={item.title} className="bg-gray-50 border border-border rounded-lg p-3">
                      <h3 className="text-[13px] font-bold text-foreground mb-1">{item.title}</h3>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">2</span>
                  Rasionalitas GarudaChain
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  Pengembangan GarudaChain dilandasi oleh beberapa pertimbangan fundamental:
                </p>
                <ul className="text-[13px] text-muted-foreground space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Kedaulatan Digital</strong> — Menjaga kedaulatan digital Indonesia dengan menyediakan infrastruktur blockchain yang dibangun untuk ekosistem Indonesia</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Efisiensi Sistem Pembayaran</strong> — Mengurangi biaya dan meningkatkan kecepatan settlement, terutama untuk transaksi lintas batas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Inovasi Keuangan</strong> — Membuka peluang pengembangan layanan keuangan baru berbasis programmable money</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Integrasi Ekosistem</strong> — Menjembatani ekonomi konvensional dengan ekonomi digital secara seamless</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Governance On-Chain</strong> — Meningkatkan transparansi dan efektivitas kebijakan melalui governance terdesentralisasi</span>
                  </li>
                </ul>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">3</span>
                  Proyek Garuda: Navigasi Indonesia
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain mengadopsi nama <strong>"Proyek Garuda"</strong> dari konsep digital currency nasional Indonesia,
                  menggunakan simbol Garuda Pancasila yang merepresentasikan identitas nasional. Proyek ini merupakan
                  manifestasi dari visi Indonesia untuk:
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <ul className="text-[13px] text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">1.</span>
                      <span>Menjadi pemain aktif dalam ekosistem blockchain global, bukan hanya pengikut</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">2.</span>
                      <span>Menyediakan infrastruktur digital yang sesuai dengan kebutuhan dan karakteristik Indonesia</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">3.</span>
                      <span>Mengintegrasikan ekonomi digital dengan tetap menjaga kedaulatan digital nasional</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">4.</span>
                      <span>Mempersiapkan infrastruktur untuk mendukung ekosistem Web3 dan aset digital secara aman</span>
                    </li>
                  </ul>
                </div>
              </section>
            </>
          )}

          {/* ========== BAB 2: DESAIN GRD ========== */}
          {activeTab === "bab2" && (
            <>
              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">1</span>
                  Lima Elemen Konfigurasi
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  GarudaChain mengadopsi 5 elemen konfigurasi utama dalam desain GRD yang menentukan
                  arsitektur dan mekanisme operasionalnya:
                </p>
                <div className="space-y-3">
                  {[
                    {
                      num: "1",
                      title: "Instrumen (Instrument)",
                      desc: "GRD diterbitkan dalam dua varian: w-GRD (wholesale) untuk transaksi antar lembaga keuangan, dan r-GRD (retail) untuk transaksi masyarakat umum. Keduanya memiliki nilai setara 1:1 dengan Rupiah (1 GRD = Rp 1.000).",
                    },
                    {
                      num: "2",
                      title: "Ledger (Pencatatan)",
                      desc: "Menggunakan blockchain berbasis Bitcoin Core v28.1 dengan UTXO model. Wholesale menggunakan DLT dengan validasi oleh node-node jaringan, sementara retail dapat menggunakan campuran DLT dan layanan off-chain.",
                    },
                    {
                      num: "3",
                      title: "Penerbit & Pengelola (Issuer & Manager)",
                      desc: "GarudaChain Governance sebagai pengelola w-GRD melalui mekanisme multi-signature governance. Untuk r-GRD, penerbitan dilakukan oleh lembaga keuangan berizin berdasarkan backing w-GRD, dengan model distribusi dua tingkat (two-tier).",
                    },
                    {
                      num: "4",
                      title: "Transfer & Settlement",
                      desc: "Mendukung settlement real-time untuk wholesale dan near-real-time untuk retail. Atomic settlement memungkinkan Delivery versus Payment (DvP) dan Payment versus Payment (PvP) secara otomatis.",
                    },
                    {
                      num: "5",
                      title: "Interoperabilitas",
                      desc: "GRD dirancang interoperabel dengan: (a) sistem pembayaran domestik yang sudah ada, (b) aset digital dan token, (c) blockchain lain untuk transaksi lintas batas melalui cross-chain bridge.",
                    },
                  ].map((item) => (
                    <div key={item.num} className="flex items-start gap-3 bg-gray-50 border border-border rounded-lg p-4">
                      <span className="text-[11px] font-bold text-white bg-primary rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">{item.num}</span>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                        <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">2</span>
                  Model Distribusi GRD
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  GRD menganut <strong>model distribusi dua tingkat (two-tier)</strong> yang memisahkan
                  peran governance protocol dan sektor swasta:
                </p>
                <div className="bg-gray-50 border border-border rounded-lg p-4 mb-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-border">
                      <span className="text-[11px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded">Tier 1</span>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">GarudaChain Governance → Lembaga Keuangan</p>
                        <p className="text-[12px] text-muted-foreground">Governance menerbitkan w-GRD kepada lembaga keuangan peserta melalui mekanisme multi-signature</p>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className="text-muted-foreground text-lg">↓</span>
                    </div>
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-border">
                      <span className="text-[11px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">Tier 2</span>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">Lembaga Keuangan → Masyarakat</p>
                        <p className="text-[12px] text-muted-foreground">Lembaga keuangan menerbitkan r-GRD kepada nasabah berdasarkan backing w-GRD</p>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Model ini menjaga peran intermediasi perbankan, mengurangi risiko disintermediasi,
                  dan memungkinkan inovasi layanan oleh sektor swasta sambil tetap menjaga kontrol
                  governance on-chain oleh GarudaChain.
                </p>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">3</span>
                  Arsitektur Teknologi 3-Layer
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  GarudaChain mengadopsi arsitektur teknologi dalam <strong>3 lapisan (layer)</strong> yang
                  saling terintegrasi:
                </p>
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="text-[14px] font-bold text-foreground mb-2">Layer 1 — Infrastruktur Inti (Core Ledger)</h3>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mb-2">
                      Lapisan dasar yang mengelola pencatatan, penerbitan, dan pemusnahan GRD. Dikelola
                      oleh GarudaChain Governance melalui mekanisme multi-signature governance.
                    </p>
                    <ul className="text-[12px] text-muted-foreground space-y-1">
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Bitcoin Core v28.1 fork sebagai backbone</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Proof-of-Work (SHA-256d) sebagai mekanisme konsensus</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Smart contract untuk programmable money</span>
                      </li>
                    </ul>
                    <div className="mt-3 bg-white/70 border border-red-100 rounded p-2">
                      <p className="text-[11px] text-primary font-semibold">
                        Implementasi GarudaChain: Bitcoin Core v28.1 fork dengan SHA-256d PoW, UTXO model, multi-signature governance
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-[14px] font-bold text-foreground mb-2">Layer 2 — Platform Integrasi</h3>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mb-2">
                      Lapisan yang menyediakan API dan protokol interoperabilitas untuk menghubungkan
                      Layer 1 dengan berbagai platform eksternal.
                    </p>
                    <ul className="text-[12px] text-muted-foreground space-y-1">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>API Gateway untuk integrasi dengan sistem perbankan</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>Cross-chain bridge untuk interoperabilitas dengan blockchain lain</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 font-bold mt-0.5">•</span>
                        <span>Oracle service untuk data feed dari dunia nyata</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h3 className="text-[14px] font-bold text-foreground mb-2">Layer 3 — Use Case & Aplikasi</h3>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mb-2">
                      Lapisan aplikasi tempat berbagai use case dibangun oleh peserta ekosistem
                      (lembaga keuangan, fintech, dan developer).
                    </p>
                    <ul className="text-[12px] text-muted-foreground space-y-1">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Pembayaran retail (P2P, P2M, G2P)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Settlement pasar keuangan (DvP, PvP)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Tokenisasi aset dan DeFi terregulasi</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Transaksi lintas batas (cross-border)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">4</span>
                  Keamanan Siber & Privasi
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain menekankan pentingnya keamanan siber dan perlindungan data sebagai fondasi
                  kepercayaan terhadap ekosistem:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { title: "Keamanan Kriptografi", desc: "Penggunaan algoritma kriptografi modern termasuk Schnorr Signature dan zero-knowledge proof untuk keamanan transaksi" },
                    { title: "Privasi Bertingkat", desc: "Managed anonymity — anonimitas terbatas untuk transaksi kecil, identifikasi penuh untuk transaksi besar sesuai ketentuan AML/CFT" },
                    { title: "Resiliensi Sistem", desc: "Arsitektur redundan dengan disaster recovery dan business continuity plan untuk menjamin ketersediaan 24/7" },
                    { title: "Kepatuhan Regulasi", desc: "Kerangka regulasi komprehensif untuk AML/CFT, perlindungan konsumen, dan perlindungan data pribadi" },
                  ].map((item) => (
                    <div key={item.title} className="bg-gray-50 border border-border rounded-lg p-3">
                      <h3 className="text-[13px] font-bold text-foreground mb-1">{item.title}</h3>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center text-[12px] font-bold">5</span>
                  Khazanah Digital GarudaChain (KDG)
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain mengimplementasikan konsep <strong>Khazanah Digital GarudaChain (KDG)</strong> — sebuah
                  infrastruktur teknologi terpadu yang menjadi "single source of truth" untuk seluruh
                  operasi GRD:
                </p>
                <ul className="text-[13px] text-muted-foreground space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span>Berfungsi sebagai platform pengelolaan siklus hidup GRD (mint, distribusi, transfer, redeem, burn)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span>Menyediakan infrastruktur blockchain yang dikelola oleh GarudaChain Governance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span>Memfasilitasi interoperabilitas dengan ekosistem keuangan konvensional dan digital</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span>Mendukung programmability dan inovasi layanan keuangan</span>
                  </li>
                </ul>
              </section>
            </>
          )}

          {/* ========== BAB 3: PETA JALAN ========== */}
          {activeTab === "bab3" && (
            <>
              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Peta Jalan GarudaChain</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  GarudaChain menetapkan peta jalan pengembangan dalam <strong>3 tahap utama</strong>,
                  dengan pendekatan bertahap dan terukur:
                </p>

                <div className="space-y-4">
                  {/* Tahap 1 */}
                  <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">Tahap 1</span>
                      <span className="text-[14px] font-bold text-foreground">Foundation (Jangka Pendek)</span>
                      <span className="text-emerald-600 text-[11px] font-semibold ml-auto">BERLANGSUNG</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mb-2">
                      Fokus pada penerbitan w-GRD sebagai digital asset settlement dan wholesale layer:
                    </p>
                    <ul className="text-[12px] text-muted-foreground space-y-1.5 ml-4">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Penerbitan w-GRD untuk transaksi wholesale antar lembaga keuangan</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Settlement governance on-chain menggunakan blockchain</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Proof of Concept (PoC) dan sandbox testing</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold mt-0.5">•</span>
                        <span>Pengembangan kerangka regulasi dan tata kelola</span>
                      </li>
                    </ul>
                  </div>

                  {/* Tahap 2 */}
                  <div className="border border-primary/30 bg-red-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded">Tahap 2</span>
                      <span className="text-[14px] font-bold text-foreground">Growth (Jangka Menengah)</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mb-2">
                      Ekspansi ke r-GRD dan integrasi ekosistem lebih luas:
                    </p>
                    <ul className="text-[12px] text-muted-foreground space-y-1.5 ml-4">
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Peluncuran r-GRD untuk transaksi retail masyarakat</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Integrasi dengan sistem pembayaran domestik</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Pengembangan use case tokenisasi aset keuangan</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>Interoperabilitas dengan platform aset digital</span>
                      </li>
                    </ul>
                  </div>

                  {/* Tahap 3 */}
                  <div className="border border-border bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold bg-gray-500 text-white px-2 py-0.5 rounded">Tahap 3</span>
                      <span className="text-[14px] font-bold text-foreground">Scale (Jangka Panjang)</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mb-2">
                      Integrasi penuh dan interkoneksi global:
                    </p>
                    <ul className="text-[12px] text-muted-foreground space-y-1.5 ml-4">
                      <li className="flex items-start gap-2">
                        <span className="text-gray-400 font-bold mt-0.5">•</span>
                        <span>Integrasi end-to-end w-GRD dan r-GRD</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-gray-400 font-bold mt-0.5">•</span>
                        <span>Interkoneksi multi-chain lintas negara</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-gray-400 font-bold mt-0.5">•</span>
                        <span>Ekosistem DeFi terregulasi berbasis GarudaChain</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-gray-400 font-bold mt-0.5">•</span>
                        <span>Full programmable money dengan smart contract canggih</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Sinergi & Kolaborasi</h2>

                <h3 className="text-[14px] font-bold text-foreground mb-3 mt-2">Kolaborasi Domestik — 7 Area Prioritas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                  {[
                    { area: "Governance On-Chain", desc: "Governance terdesentralisasi berbasis blockchain untuk meningkatkan efisiensi dan transparansi" },
                    { area: "Pasar Keuangan", desc: "Tokenisasi saham dan instrumen pasar keuangan lainnya melalui smart contract" },
                    { area: "Sistem Pembayaran", desc: "Integrasi GarudaChain dengan infrastruktur pembayaran nasional" },
                    { area: "Inklusi Keuangan", desc: "Memperluas akses layanan keuangan ke masyarakat unbanked melalui GarudaChain" },
                    { area: "Ekonomi Syariah", desc: "Pengembangan instrumen GRD yang sesuai dengan prinsip syariah" },
                    { area: "Pemerintahan", desc: "Distribusi bantuan sosial (G2P) dan penerimaan negara melalui Treasury Wallet" },
                    { area: "Aset Digital", desc: "Interoperabilitas dengan ekosistem aset digital dan token yang terregulasi" },
                  ].map((item) => (
                    <div key={item.area} className="bg-gray-50 border border-border rounded-lg p-3">
                      <h4 className="text-[12px] font-bold text-foreground mb-1">{item.area}</h4>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <h3 className="text-[14px] font-bold text-foreground mb-3">Kolaborasi Internasional</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain aktif dalam berbagai inisiatif blockchain internasional:
                </p>
                <ul className="text-[13px] text-muted-foreground space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Cross-Chain Bridge</strong> — Interoperabilitas dengan blockchain utama (Ethereum, BSC, Solana) untuk multi-chain settlement</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>G20 Cross-Border Payments</strong> — Partisipasi dalam roadmap peningkatan pembayaran lintas batas G20</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>ASEAN Payment Connectivity</strong> — Integrasi pembayaran real-time antar negara ASEAN</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Global Blockchain Coalition</strong> — Pertukaran pengetahuan dan best practice pengembangan blockchain global</span>
                  </li>
                </ul>
              </section>
            </>
          )}

          {/* ========== GARUDACHAIN TEKNIS ========== */}
          {activeTab === "teknis" && (
            <>
              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Implementasi GarudaChain</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  GarudaChain adalah implementasi blockchain dari visi Proyek Garuda, dibangun di atas
                  fondasi <strong>Bitcoin Core v28.1</strong> dengan modifikasi khusus untuk mendukung
                  ekosistem digital currency — <strong>Garuda Rupiah Digital (GRD)</strong>.
                </p>

                <div className="bg-gray-50 border border-border rounded-lg p-4 mb-4 font-mono text-[11px] text-muted-foreground">
                  <p className="text-foreground font-bold mb-2">// Parameter Jaringan GarudaChain</p>
                  <p>Network Name: GarudaChain Mainnet</p>
                  <p>Symbol: GRD (Garuda Rupiah Digital)</p>
                  <p>Block Reward: 0.01 GRD per block</p>
                  <p>APBN Allocation: 1% (0.0001 GRD per block)</p>
                  <p>Peg Value: 1 GRD = Rp 1.000</p>
                  <p>Block Time Target: ~10 menit</p>
                  <p>Consensus: Proof of Work (SHA-256d)</p>
                  <p>Default RPC Port: 9446</p>
                  <p>Default P2P Port: 9333</p>
                  <p>Signature: Schnorr / Multi-Signature</p>
                  <p>UTXO Model: Bitcoin-compatible</p>
                </div>
              </section>


              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Tokenomics GRD</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 border border-border rounded-lg p-4">
                    <h4 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Distribusi Block Reward</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-foreground">Miner Reward</span>
                        <span className="text-[13px] font-bold text-foreground">0.0099 GRD (99%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{ width: "99%" }} />
                      </div>
                      <div className="flex justify-between items-center mt-3">
                        <span className="text-[13px] text-foreground">Treasury Wallet</span>
                        <span className="text-[13px] font-bold text-amber-600">0.0001 GRD (1%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-amber-500 h-2 rounded-full" style={{ width: "1%" }} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 border border-border rounded-lg p-4">
                    <h4 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Informasi Supply</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-[13px] text-muted-foreground">Block Reward</span>
                        <span className="text-[13px] font-medium">0.01 GRD / block</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[13px] text-muted-foreground">Total Supply</span>
                        <span className="text-[13px] font-medium">{stats ? `${formatNumber(stats.latestBlock * 0.01)} GRD` : "..."}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[13px] text-muted-foreground">Treasury Reserve</span>
                        <span className="text-[13px] font-medium">{stats ? `${formatNumber(Math.floor(stats.latestBlock * 0.01 * 0.01))} GRD` : "..."}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[13px] text-muted-foreground">Max Supply</span>
                        <span className="text-[13px] font-medium">Tidak Terbatas (Governance)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Integrasi Treasury</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  Fitur unik GarudaChain: alokasi otomatis <strong>1% dari setiap block reward</strong> ke
                  Treasury Wallet. Sejalan dengan visi Proyek Garuda untuk mengintegrasikan
                  blockchain dengan sistem keuangan publik (G2P/P2G).
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-[13px] text-foreground font-medium mb-2">Mekanisme Treasury Allocation:</p>
                  <ol className="text-[12px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Miner menemukan block baru dan mendapatkan block reward <strong>0.01 GRD (= Rp 10)</strong></li>
                    <li>Secara otomatis, <strong>0.0001 GRD (1%)</strong> dialokasikan ke Treasury Wallet</li>
                    <li>Sisa <strong>0.0099 GRD (99%)</strong> diberikan ke miner sebagai reward</li>
                    <li>Alokasi Treasury bersifat <em>hardcoded</em> di protokol — tidak bisa diubah tanpa hard fork</li>
                    <li>Semua alokasi tercatat transparan di blockchain dan dapat diaudit publik</li>
                  </ol>
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Mekanisme Konsensus</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain menggunakan <strong>Proof-of-Work (SHA-256d)</strong> identik dengan Bitcoin untuk Layer 1
                  core ledger. Pemilihan PoW didasarkan pada:
                </p>
                <ul className="text-[13px] text-muted-foreground space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Keamanan terbukti</strong> — SHA-256d telah melindungi jaringan Bitcoin sejak 2009</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Desentralisasi</strong> — Siapa pun dapat menjadi miner tanpa izin khusus</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Kompatibilitas hardware</strong> — Dapat menggunakan ASIC SHA-256 yang sudah ada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span><strong>Resistensi sensor</strong> — Tidak ada entitas tunggal yang dapat mengontrol jaringan</span>
                  </li>
                </ul>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3">Peg Value & Mekanisme Governance</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GRD memiliki nilai tetap (<em>pegged</em>) terhadap Rupiah:
                  <strong> 1 GRD = Rp 1.000</strong>. Block reward 0.01 GRD setara dengan Rp 100 per block.
                  Karena mekanisme mining sangat cepat (~5 detik per block) dan <strong>tidak ada max supply</strong>,
                  reward kecil per block tetap memberikan insentif yang cukup bagi miner.
                </p>
                <div className="bg-gray-50 border border-border rounded-lg p-4 mb-4 font-mono text-[11px] text-muted-foreground">
                  <p className="text-foreground font-bold mb-2">// Kalkulasi Harian</p>
                  <p>Block Reward: 0.01 GRD (= Rp 10) per block</p>
                  <p>Block Time: ~5 detik</p>
                  <p>Blocks per Jam: ~720</p>
                  <p>Blocks per Hari: ~1,440</p>
                  <p>Miner Earning/Hari: ~142.56 GRD (= ~Rp 142.560)</p>
                  <p>Treasury Earning/Hari: ~1.44 GRD (= ~Rp 1.440)</p>
                </div>
              </section>

              <section className="bg-white border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-foreground mb-3 text-primary">Kebijakan Krisis & Stabilitas</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  GarudaChain memiliki mekanisme kebijakan yang dapat diaktifkan oleh otoritas governance
                  melalui multi-signature saat terjadi krisis:
                </p>
                <div className="space-y-3">
                  {[
                    {
                      title: "Penyesuaian Block Reward",
                      desc: "Governance council dapat menurunkan atau menaikkan block reward melalui hard fork terkoordinasi untuk mengendalikan laju penerbitan GRD sesuai kebutuhan ekosistem.",
                      color: "border-red-200 bg-red-50",
                    },
                    {
                      title: "Mint & Burn Emergency",
                      desc: "Operasi mint (cetak) dan burn (musnahkan) GRD secara darurat menggunakan threshold 3-of-5 multi-authority signature. Digunakan untuk stabilisasi ekosistem.",
                      color: "border-amber-200 bg-amber-50",
                    },
                    {
                      title: "Peg Stabilization",
                      desc: "Mekanisme menjaga stabilitas peg 1 GRD = Rp 1.000. Jika terjadi deviasi, governance dapat intervensi melalui operasi pasar terbuka digital.",
                      color: "border-blue-200 bg-blue-50",
                    },
                    {
                      title: "Freeze & Blacklist",
                      desc: "Kemampuan membekukan alamat terkait pencucian uang atau pendanaan terorisme sesuai ketentuan AML/CFT, tanpa mengganggu operasi jaringan secara keseluruhan.",
                      color: "border-purple-200 bg-purple-50",
                    },
                    {
                      title: "Emergency Hard Fork",
                      desc: "Dalam skenario krisis ekstrem, governance council dapat mengkoordinasikan hard fork darurat untuk mengubah parameter jaringan (block reward, block time, fee structure) secara cepat.",
                      color: "border-emerald-200 bg-emerald-50",
                    },
                  ].map((item) => (
                    <div key={item.title} className={`border rounded-lg p-4 ${item.color}`}>
                      <h3 className="text-[13px] font-bold text-foreground mb-1">{item.title}</h3>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    <strong className="text-primary">Prinsip utama:</strong> Semua kebijakan krisis bersifat transparan dan tercatat
                    permanen di blockchain. Tidak ada operasi yang dapat dilakukan secara sepihak — selalu membutuhkan
                    persetujuan multi-authority (minimal 3 dari 5 layer). Ini menjamin <em>checks and balances</em> bahkan
                    dalam situasi darurat.
                  </p>
                </div>
              </section>
            </>
          )}

          {/* Footer Penutup — always visible */}
          <section className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6 flex items-start gap-4">
            <img src="/garuda.svg" alt="Garuda" className="w-14 h-14 object-contain flex-shrink-0 opacity-80" />
            <div>
              <h2 className="text-[15px] font-bold text-foreground mb-2">Tentang Dokumen Ini</h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Whitepaper ini menjelaskan arsitektur dan implementasi <strong>GarudaChain</strong> — blockchain berdaulat
                Indonesia yang mengadopsi konsep <strong>Proyek Garuda</strong> tentang digital currency nasional. GarudaChain
                mengimplementasikan visi tersebut dalam infrastruktur blockchain yang transparan, aman, dan dapat diaudit,
                dengan native token GRD (Garuda Rupiah Digital).
              </p>
              <p className="text-[12px] text-muted-foreground mt-3 italic">
                "Blockchain Berdaulat untuk Indonesia yang Berdikari — Implementasi Proyek Garuda"
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                GarudaChain v1.0 — Mengadopsi arsitektur digital currency nasional untuk ekosistem blockchain Indonesia.
              </p>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
