import { Layout } from "@/components/Layout";
import { useState } from "react";
import {
  Pickaxe, Download, Terminal, Copy, Check,
  Zap, Box, Shield, HardDrive,
} from "lucide-react";

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      {label && <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>}
      <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
        <pre className="whitespace-pre-wrap">{code}</pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 opacity-0 group-hover:opacity-100 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function MinerMining() {
  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-3">
            <Pickaxe className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Panduan Mining GarudaChain</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Mulai mining GRD hanya dengan 2 perintah. Semua konfigurasi dilakukan otomatis oleh sistem.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Info Cards */}
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { icon: Zap, label: "Algorithm", value: "SHA-256d", color: "text-yellow-600", bg: "bg-yellow-50" },
            { icon: Box, label: "Block Reward", value: "0.01 GRD", color: "text-emerald-600", bg: "bg-emerald-50" },
            { icon: Shield, label: "APBN Fee", value: "8% otomatis", color: "text-blue-600", bg: "bg-blue-50" },
            { icon: HardDrive, label: "Platform", value: "Linux x86_64", color: "text-purple-600", bg: "bg-purple-50" },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-4 border`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Step 1: Download & Install */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            <div className="w-10 h-10 bg-red-100 text-red-700 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
              1
            </div>
            <div>
              <h3 className="text-lg font-semibold">Download & Install</h3>
              <p className="text-sm text-gray-500">Download semua binary (node + miner) dan script garuda-miner</p>
            </div>
            <Download className="w-5 h-5 text-gray-400 ml-auto" />
          </div>
          <div className="px-5 pb-5 space-y-4">
            <CodeBlock
              code={`wget -O ~/bin/garuda-miner https://garudachain.org/downloads/garuda-miner && chmod +x ~/bin/garuda-miner`}
            />
            <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
              <p>Script ini akan otomatis mendownload semua yang diperlukan:</p>
              <ul className="mt-2 space-y-1 ml-4 list-disc text-gray-500">
                <li>GarudaChain node (<code className="bg-gray-200 px-1 rounded text-xs">garudad</code>, <code className="bg-gray-200 px-1 rounded text-xs">garuda-cli</code>)</li>
                <li>CPU Miner (<code className="bg-gray-200 px-1 rounded text-xs">cpuminer</code>)</li>
                <li>Konfigurasi node otomatis</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 2: Jalankan garuda-miner */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            <div className="w-10 h-10 bg-red-100 text-red-700 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
              2
            </div>
            <div>
              <h3 className="text-lg font-semibold">Jalankan Miner</h3>
              <p className="text-sm text-gray-500">Buka terminal dan jalankan garuda-miner</p>
            </div>
            <Terminal className="w-5 h-5 text-gray-400 ml-auto" />
          </div>
          <div className="px-5 pb-5 space-y-4">
            <CodeBlock code={`garuda-miner`} />

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700">
              <p className="font-medium mb-2">Sistem akan otomatis:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Menjalankan node GarudaChain</li>
                <li>Membuat wallet (jika belum ada)</li>
                <li>Menampilkan menu pilihan:</li>
              </ul>
              <pre className="font-mono text-xs bg-white/60 rounded p-3 mt-3 overflow-x-auto text-emerald-800">{`╔══════════════════════════════════════╗
║       GARUDA MINER - Publik        ║
╚══════════════════════════════════════╝

  1) Solo Mining   — mining langsung dengan CPU
  2) Pool Mining   — mining ke pool stratum
  3) Lihat Saldo   — cek saldo wallet
  4) Buat Wallet   — buat alamat wallet baru
  5) Keluar`}</pre>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2 font-medium">Contoh output mining:</p>
              <pre className="font-mono text-xs text-green-400 overflow-x-auto">{`** GARUDA Miner (based on cpuminer-multi) **
[2026-03-21 20:57:01] 1 miner threads started, using 'sha256d' algorithm.
[2026-03-21 20:57:01] Current block is 384
[2026-03-21 20:57:01] APBN fee: 10000 receh (1% to pembangunan blockchain)
[2026-03-21 20:57:01] CPU #0: 380.95 kH/s
[2026-03-21 20:57:01] accepted: 1/1 (diff 0.000), 380.95 kH/s yes!`}</pre>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-gray-100 border rounded-xl p-6 text-center">
          <Terminal className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700 mb-1">Hanya 2 perintah untuk mulai mining</p>
          <p className="text-sm text-gray-500">
            Semua konfigurasi (node, wallet, koneksi) dilakukan otomatis oleh <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">garuda-miner</code>.
          </p>
        </div>
      </div>
    </Layout>
  );
}
