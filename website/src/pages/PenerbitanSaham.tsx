import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Coins, FileText, CheckCircle2, AlertTriangle,
  Rocket, TrendingUp, Shield, Banknote,
  ChevronRight, Wallet, Plus, Minus, Info, ExternalLink,
  Image, Globe, Twitter, Instagram, Youtube, Facebook, Linkedin
} from "lucide-react";
import { AssetLogoUpload } from "@/components/AssetLogo";
import { UpdateLogoForm } from "@/components/UpdateLogoForm";

function fmt(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function fmtNum(v: number) {
  return new Intl.NumberFormat("id-ID").format(v);
}

const CREATION_FEE = 5000; // 5,000 GRD
const PRESALE_FEE_PCT = 2; // 2% of presale raise

const PRESALE_DURATIONS = [
  { label: "3 Hari", days: 3 },
  { label: "7 Hari", days: 7 },
  { label: "14 Hari", days: 14 },
  { label: "30 Hari", days: 30 },
];

export function PenerbitanSaham() {
  const { isConnected, connect } = useWallet();
  const { toast } = useToast();

  // Form state
  const [step, setStep] = useState(1);
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [totalSupply, setTotalSupply] = useState<number>(1000000);
  const [pricePerToken, setPricePerToken] = useState<number>(100);
  const [presaleAllocation, setPresaleAllocation] = useState<number>(30);
  const [presaleDuration, setPresaleDuration] = useState(7);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [socialX, setSocialX] = useState("");
  const [socialIG, setSocialIG] = useState("");
  const [socialYT, setSocialYT] = useState("");
  const [socialFB, setSocialFB] = useState("");
  const [socialLI, setSocialLI] = useState("");
  const [socialTT, setSocialTT] = useState("");
  const [sektor, setSektor] = useState("");
  const [doc1File, setDoc1File] = useState<File | null>(null);
  const [doc2File, setDoc2File] = useState<File | null>(null);
  const [doc1Url, setDoc1Url] = useState<string | null>(null);
  const [doc2Url, setDoc2Url] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoIpfsHash, setLogoIpfsHash] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const presaleTokens = Math.floor(totalSupply * (presaleAllocation / 100));
  const presaleRaise = presaleTokens * pricePerToken;
  const platformFee = presaleRaise * (PRESALE_FEE_PCT / 100);

  const canProceed = () => {
    if (step === 1) return tokenName.length >= 3 && tokenSymbol.length >= 2 && companyName.length >= 3;
    if (step === 2) return totalSupply > 0 && pricePerToken > 0;
    if (step === 3) return presaleAllocation >= 10 && presaleAllocation <= 80;
    return true;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Upload PDF docs to IPFS first (if any)
      const uploadDoc = async (file: File, slot: string): Promise<{ url: string; name: string } | null> => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/asset/doc/${tokenSymbol}/${slot}`, { method: "POST", body: fd }).then(r => r.json());
        return res.ipfs_url ? { url: res.ipfs_url, name: file.name } : null;
      };

      let d1: { url: string; name: string } | null = null;
      let d2: { url: string; name: string } | null = null;
      if (doc1File) d1 = await uploadDoc(doc1File, "doc1");
      if (doc2File) d2 = await uploadDoc(doc2File, "doc2");
      if (d1) setDoc1Url(d1.url);
      if (d2) setDoc2Url(d2.url);

      // Save metadata
      await fetch(`/api/asset/metadata/${tokenSymbol}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: sektor,
          website,
          social_x: socialX,
          social_ig: socialIG,
          social_yt: socialYT,
          social_fb: socialFB,
          social_li: socialLI,
          social_tt: socialTT,
          doc1_url: d1?.url ?? doc1Url ?? "",
          doc1_name: d1?.name ?? doc1File?.name ?? "",
          doc2_url: d2?.url ?? doc2Url ?? "",
          doc2_name: d2?.name ?? doc2File?.name ?? "",
        }),
      });

      toast({
        title: "Token Saham Berhasil Dibuat!",
        description: `${tokenSymbol} telah di-deploy di GarudaChain. Presale akan dimulai segera.`,
      });
      setStep(5);
    } catch {
      toast({ title: "Error", description: "Gagal menyimpan metadata." });
    }
    setIsSubmitting(false);
  };

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <Link href="/saham" className="text-white/70 hover:text-white text-sm flex items-center gap-1 mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Saham
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Coins className="w-7 h-7" />
            <h1 className="text-2xl font-bold">Create Token Saham</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Buat token saham perusahaan Anda di GarudaChain. Deploy smart contract, atur presale (e-IPO), dan mulai trading — semuanya on-chain.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: Form */}
          <div className="lg:col-span-2">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-6">
              {[
                { n: 1, label: "Info Token" },
                { n: 2, label: "Supply & Harga" },
                { n: 3, label: "Presale (e-IPO)" },
                { n: 4, label: "Review" },
              ].map((s, idx) => (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                    step >= s.n ? "bg-[#8B0000] text-white" : "bg-gray-100 text-muted-foreground"
                  }`}>
                    {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                  </div>
                  <span className={`text-xs font-semibold hidden sm:block ${step >= s.n ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {idx < 3 && <div className={`flex-1 h-0.5 rounded ${step > s.n ? "bg-[#8B0000]" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>

            {/* Step 1: Token Info */}
            {step === 1 && (
              <div className="bg-white border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#8B0000]" />
                  Informasi Token Saham
                </h2>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-foreground mb-1.5 block">Nama Perusahaan</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="PT Contoh Indonesia Tbk"
                        className="w-full border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-[#8B0000] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-foreground mb-1.5 block">Sektor Industri</label>
                      <select
                        value={sektor}
                        onChange={(e) => setSektor(e.target.value)}
                        className="w-full border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-[#8B0000] transition-colors bg-white"
                      >
                        <option value="">Pilih sektor...</option>
                        {["Perbankan","Teknologi","Energi","Kesehatan","Properti","Konsumer","Industri","Telekomunikasi","Keuangan","Pertambangan","Pertanian","Infrastruktur"].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-foreground mb-1.5 block">Nama Token</label>
                      <input
                        type="text"
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        placeholder="Contoh Token"
                        className="w-full border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-[#8B0000] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-foreground mb-1.5 block">Kode Token (Ticker)</label>
                      <input
                        type="text"
                        value={tokenSymbol}
                        onChange={(e) => setTokenSymbol(e.target.value.toUpperCase().slice(0, 5))}
                        placeholder="CTOH"
                        maxLength={5}
                        className="w-full border border-border rounded-lg px-4 py-3 text-sm font-mono uppercase outline-none focus:border-[#8B0000] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">Deskripsi Perusahaan</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Jelaskan tentang perusahaan dan bisnis Anda..."
                      rows={4}
                      className="w-full border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-[#8B0000] transition-colors resize-none"
                    />
                  </div>

                  {/* Logo Upload */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">Logo Perusahaan</label>
                    <div className="flex items-center gap-4 border border-border rounded-xl p-4 bg-gray-50/50">
                      <AssetLogoUpload
                        symbol={tokenSymbol || "LOGO"}
                        size={64}
                        onUploaded={(url) => {
                          setLogoIpfsHash(url);
                          setLogoPreview(url);
                        }}
                      />
                      <div className="flex-1 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-0.5">Upload logo ke IPFS</p>
                        <p className="text-[11px]">Logo akan disimpan permanen di Pinata IPFS dan muncul otomatis di seluruh website — DEX, halaman saham, transfer, dll.</p>
                        {logoIpfsHash && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[10px] text-emerald-600 font-mono font-semibold">IPFS tersimpan</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://perusahaan.co.id"
                        className="w-full border border-border rounded-lg pl-10 pr-4 py-3 text-sm outline-none focus:border-[#8B0000] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Social Media */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-2 block">Social Media</label>
                    <div className="space-y-2.5">
                      {[
                        { icon: Twitter, label: "X (Twitter)", value: socialX, setter: setSocialX, placeholder: "https://x.com/perusahaan" },
                        { icon: Instagram, label: "Instagram", value: socialIG, setter: setSocialIG, placeholder: "https://instagram.com/perusahaan" },
                        { icon: Youtube, label: "YouTube", value: socialYT, setter: setSocialYT, placeholder: "https://youtube.com/@perusahaan" },
                        { icon: Facebook, label: "Facebook", value: socialFB, setter: setSocialFB, placeholder: "https://facebook.com/perusahaan" },
                        { icon: Linkedin, label: "LinkedIn", value: socialLI, setter: setSocialLI, placeholder: "https://linkedin.com/company/perusahaan" },
                        { icon: FileText, label: "TikTok", value: socialTT, setter: setSocialTT, placeholder: "https://tiktok.com/@perusahaan" },
                      ].map((s) => (
                        <div key={s.label} className="relative">
                          <s.icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="url"
                            value={s.value}
                            onChange={(e) => s.setter(e.target.value)}
                            placeholder={s.placeholder}
                            className="w-full border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#8B0000] transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dokumen PDF */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-2 block">Dokumen Perusahaan (PDF, opsional)</label>
                    <div className="space-y-2.5">
                      {[
                        { label: "Prospektus / Laporan Keuangan", file: doc1File, setFile: setDoc1File, url: doc1Url, slot: "doc1" },
                        { label: "Legalitas / Akta Perusahaan", file: doc2File, setFile: setDoc2File, url: doc2Url, slot: "doc2" },
                      ].map((d) => (
                        <div key={d.slot} className="flex items-center gap-3 border border-border rounded-lg px-4 py-3 bg-gray-50/50">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm text-muted-foreground flex-1 truncate">
                            {d.file ? d.file.name : d.label}
                          </span>
                          {d.url && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                          <label className="cursor-pointer text-xs font-semibold text-[#8B0000] hover:underline whitespace-nowrap">
                            Pilih PDF
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                d.setFile(f);
                              }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">File akan di-upload ke IPFS via Pinata. Hash IPFS disimpan permanen di blockchain bersama token metadata.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Supply & Price */}
            {step === 2 && (
              <div className="bg-white border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Coins className="w-5 h-5 text-[#8B0000]" />
                  Total Supply & Harga Token
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">Total Supply (Jumlah Token)</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setTotalSupply(Math.max(100000, totalSupply - 100000))} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        value={totalSupply}
                        onChange={(e) => setTotalSupply(Math.max(1, Number(e.target.value)))}
                        className="flex-1 border border-border rounded-lg px-4 py-3 text-sm font-mono text-center outline-none focus:border-[#8B0000] transition-colors"
                      />
                      <button onClick={() => setTotalSupply(totalSupply + 100000)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">1 token = 1 lembar saham perusahaan</p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">Harga Per Token (IDR-T)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">Rp</span>
                      <input
                        type="number"
                        value={pricePerToken}
                        onChange={(e) => setPricePerToken(Math.max(1, Number(e.target.value)))}
                        className="w-full border border-border rounded-lg pl-10 pr-16 py-3 text-sm font-mono outline-none focus:border-[#8B0000] transition-colors"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">IDR-T</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Harga awal saat presale (e-IPO)</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Supply</span>
                        <span className="font-mono font-semibold">{fmtNum(totalSupply)} token</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Harga Per Token</span>
                        <span className="font-mono font-semibold">{fmt(pricePerToken)}</span>
                      </div>
                      <div className="flex justify-between col-span-2 pt-2 border-t border-border">
                        <span className="text-muted-foreground font-semibold">Valuasi Total (FDV)</span>
                        <span className="font-mono font-bold text-[#8B0000]">{fmt(totalSupply * pricePerToken)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Presale / e-IPO */}
            {step === 3 && (
              <div className="bg-white border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-[#8B0000]" />
                  Presale (e-IPO) Settings
                </h2>
                <p className="text-sm text-muted-foreground -mt-2">
                  e-IPO adalah mekanisme presale di GarudaChain. Investor dapat membeli token saham sebelum listing di DEX.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-1.5 block">
                      Alokasi Presale ({presaleAllocation}%)
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      value={presaleAllocation}
                      onChange={(e) => setPresaleAllocation(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8B0000]"
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                      <span>Min 10%</span>
                      <span className="font-mono font-bold text-foreground">{fmtNum(presaleTokens)} token ({presaleAllocation}%)</span>
                      <span>Max 80%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-foreground mb-2 block">Durasi Presale</label>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESALE_DURATIONS.map((d) => (
                        <button
                          key={d.days}
                          onClick={() => setPresaleDuration(d.days)}
                          className={`py-2.5 rounded-lg text-sm font-semibold transition-all border ${
                            presaleDuration === d.days
                              ? "bg-[#8B0000] text-white border-[#8B0000]"
                              : "bg-white text-foreground border-border hover:border-[#8B0000]/30"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Proyeksi Presale
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Token Dijual</span>
                        <span className="font-mono font-semibold text-emerald-800">{fmtNum(presaleTokens)} token</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Harga Per Token</span>
                        <span className="font-mono font-semibold text-emerald-800">{fmt(pricePerToken)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-emerald-300">
                        <span className="text-emerald-700 font-semibold">Target Raise</span>
                        <span className="font-mono font-bold text-emerald-800">{fmt(presaleRaise)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Platform Fee ({PRESALE_FEE_PCT}%)</span>
                        <span className="font-mono text-emerald-800">-{fmt(platformFee)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-emerald-300">
                        <span className="text-emerald-700 font-bold">Net Raise (Estimasi)</span>
                        <span className="font-mono font-bold text-emerald-900">{fmt(presaleRaise - platformFee)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                      Setelah presale berakhir, sisa token yang tidak terjual dikembalikan ke wallet Anda. Token akan otomatis tercatat di on-chain order book GarudaChain setelah presale selesai.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="bg-white border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#8B0000]" />
                  Review & Deploy
                </h2>

                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2.5">
                    <h4 className="text-sm font-bold text-foreground mb-2">Token Info</h4>
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-12 h-12 rounded-xl border border-border object-contain bg-white" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl border border-border bg-gray-100 flex items-center justify-center">
                          <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold">{companyName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{tokenName} ({tokenSymbol})</p>
                        {logoIpfsHash && (
                          <p className="text-[10px] font-mono text-emerald-600 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" /> IPFS: {logoIpfsHash.slice(0, 16)}...
                          </p>
                        )}
                      </div>
                    </div>
                    {[
                      { label: "Website", value: website || "—" },
                      ...(socialX ? [{ label: "X (Twitter)", value: socialX }] : []),
                      ...(socialIG ? [{ label: "Instagram", value: socialIG }] : []),
                      ...(socialYT ? [{ label: "YouTube", value: socialYT }] : []),
                      ...(socialFB ? [{ label: "Facebook", value: socialFB }] : []),
                      ...(socialLI ? [{ label: "LinkedIn", value: socialLI }] : []),
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-semibold text-foreground truncate ml-4 max-w-[60%] text-right">{r.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-2.5">
                    <h4 className="text-sm font-bold text-foreground mb-2">Supply & Harga</h4>
                    {[
                      { label: "Total Supply", value: `${fmtNum(totalSupply)} token` },
                      { label: "Harga Per Token", value: fmt(pricePerToken) },
                      { label: "Valuasi (FDV)", value: fmt(totalSupply * pricePerToken) },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-mono font-semibold text-foreground">{r.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-2.5">
                    <h4 className="text-sm font-bold text-foreground mb-2">Presale (e-IPO)</h4>
                    {[
                      { label: "Alokasi Presale", value: `${presaleAllocation}% (${fmtNum(presaleTokens)} token)` },
                      { label: "Durasi", value: `${presaleDuration} hari` },
                      { label: "Target Raise", value: fmt(presaleRaise) },
                      { label: "Platform Fee", value: `${PRESALE_FEE_PCT}% (${fmt(platformFee)})` },
                    ].map((r) => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-mono font-semibold text-foreground">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-[#8B0000]/5 border border-[#8B0000]/20 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-[#8B0000] mb-3 flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    Biaya Pembuatan Token
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-foreground">Deploy Smart Contract</span>
                      <span className="font-mono font-semibold">2,000 GRD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground">Presale Setup</span>
                      <span className="font-mono font-semibold">1,500 GRD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground">Listing Fee (DEX)</span>
                      <span className="font-mono font-semibold">1,000 GRD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground">Network Fee</span>
                      <span className="font-mono font-semibold">500 GRD</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-[#8B0000]/20">
                      <span className="font-bold text-[#8B0000]">Total Biaya</span>
                      <span className="font-mono font-bold text-[#8B0000]">{fmtNum(CREATION_FEE)} GRD ({fmt(CREATION_FEE * 1000)})</span>
                    </div>
                  </div>
                </div>

                {!isConnected ? (
                  <button
                    onClick={connect}
                    className="w-full py-4 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet untuk Deploy
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-4 rounded-xl text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deploying Smart Contract...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4" />
                        Deploy Token & Mulai Presale — {fmtNum(CREATION_FEE)} GRD
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Step 5: Success */}
            {step === 5 && (
              <div className="bg-white border border-border rounded-xl p-8 text-center space-y-4">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-20 h-20 rounded-2xl border border-border object-contain bg-white mx-auto shadow-sm" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                )}
                <h2 className="text-xl font-bold text-foreground">Token Berhasil Di-deploy!</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  <span className="font-bold text-foreground">{tokenSymbol}</span> ({tokenName}) telah di-deploy di GarudaChain.
                  Presale (e-IPO) akan aktif selama {presaleDuration} hari.
                </p>

                <div className="bg-gray-50 rounded-lg p-4 max-w-sm mx-auto space-y-2 text-sm text-left">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Address</span>
                    <span className="font-mono text-xs text-foreground">GRD1q...{tokenSymbol.toLowerCase()}x7k</span>
                  </div>
                  {logoIpfsHash && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Logo IPFS (Pinata)</span>
                      <span className="font-mono text-xs text-emerald-600">{logoIpfsHash.slice(0, 12)}...</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Presale Status</span>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Berakhir</span>
                    <span className="font-mono text-foreground">{presaleDuration} hari lagi</span>
                  </div>
                </div>

                {/* Social Links */}
                {(website || socialX || socialIG || socialYT || socialFB || socialLI) && (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {website && <a href={website} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"><Globe className="w-4 h-4 text-muted-foreground" /></a>}
                    {socialX && <a href={socialX} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"><Twitter className="w-4 h-4 text-muted-foreground" /></a>}
                    {socialIG && <a href={socialIG} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"><Instagram className="w-4 h-4 text-muted-foreground" /></a>}
                    {socialYT && <a href={socialYT} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"><Youtube className="w-4 h-4 text-muted-foreground" /></a>}
                    {socialFB && <a href={socialFB} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"><Facebook className="w-4 h-4 text-muted-foreground" /></a>}
                    {socialLI && <a href={socialLI} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"><Linkedin className="w-4 h-4 text-muted-foreground" /></a>}
                  </div>
                )}

                <div className="max-w-sm mx-auto w-full text-left">
                  <UpdateLogoForm defaultSymbol={tokenSymbol} title="Update Logo Token" />
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Link href={`/saham/${tokenSymbol}`} className="bg-[#8B0000] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#6B0000] transition-colors flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" /> Detail Saham
                  </Link>
                  <Link href="/saham" className="border border-border px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Daftar Saham
                  </Link>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            {step < 5 && (
              <div className="flex items-center justify-between mt-4">
                {step > 1 ? (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="px-6 py-2.5 rounded-lg text-sm font-semibold border border-border hover:bg-gray-50 transition-colors"
                  >
                    Kembali
                  </button>
                ) : <div />}
                {step < 4 && (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canProceed()}
                    className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                  >
                    Lanjut <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Info Sidebar */}
          <div className="space-y-4">
            {/* Cost Summary */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-[#8B0000]" />
                Biaya Pembuatan
              </h3>
              <div className="space-y-2.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Smart Contract Deploy</span>
                  <span className="font-mono font-semibold">2,000 GRD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Presale Setup</span>
                  <span className="font-mono font-semibold">1,500 GRD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Listing Fee (DEX)</span>
                  <span className="font-mono font-semibold">1,000 GRD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network Fee</span>
                  <span className="font-mono font-semibold">500 GRD</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-mono font-bold text-[#8B0000]">{fmtNum(CREATION_FEE)} GRD</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  ≈ {fmt(CREATION_FEE * 1000)} (1 GRD = Rp 1.000)
                </p>
              </div>
            </div>

            {/* How Presale Works */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Rocket className="w-4 h-4 text-[#8B0000]" />
                Bagaimana Presale (e-IPO) Bekerja?
              </h3>
              <div className="space-y-3">
                {[
                  { step: 1, text: "Anda deploy token saham dan atur harga + alokasi presale" },
                  { step: 2, text: "Presale (e-IPO) otomatis aktif — investor bisa beli token dengan IDR-T" },
                  { step: 3, text: "Setelah presale berakhir, token otomatis tercatat di on-chain order book GarudaChain" },
                  { step: 4, text: "Dana dari presale dikirim ke wallet Anda (dikurangi platform fee 2%)" },
                  { step: 5, text: "Token diperdagangkan bebas on-chain — harga ditentukan pasar" },
                ].map((s) => (
                  <div key={s.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#8B0000]/10 text-[#8B0000] flex items-center justify-center text-[11px] font-bold shrink-0">
                      {s.step}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Requirements */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Persyaratan
              </h3>
              <ul className="space-y-2">
                {[
                  "Wallet GarudaChain terkoneksi",
                  `Saldo minimal ${fmtNum(CREATION_FEE)} GRD`,
                  "KYC terverifikasi (untuk emiten)",
                  "Dokumen perusahaan lengkap",
                ].map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Stats */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#8B0000]" />
                Statistik Platform
              </h3>
              <div className="space-y-2.5 text-[13px]">
                {[
                  { label: "Token Saham Aktif", value: "8" },
                  { label: "Total Presale", value: "12" },
                  { label: "Total Raised", value: fmt(45000000000) },
                  { label: "Investor Terdaftar", value: "2,847" },
                ].map((s) => (
                  <div key={s.label} className="flex justify-between">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-semibold text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
