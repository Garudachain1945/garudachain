import { Layout } from "@/components/Layout";
import { useState } from "react";
import { Code2, Copy, CheckCircle2, Server, Shield, Zap, Book, ChevronRight, Terminal, Globe } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  desc: string;
  params?: { name: string; type: string; required: boolean; desc: string }[];
  response: string;
  example: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET", path: "/api/stats", desc: "Mendapatkan statistik jaringan GarudaChain (block height, total transactions, TPS, dll)",
    response: `{
  "latestBlock": 150234,
  "totalTransactions": 450120,
  "totalAddresses": 28500,
  "avgBlockTime": 60,
  "tps": 2.5,
  "validators": 10
}`,
    example: `curl https://explorer.garudachain.org/api/stats`,
  },
  {
    method: "GET", path: "/api/blocks", desc: "Mendapatkan daftar block terbaru",
    params: [
      { name: "limit", type: "number", required: false, desc: "Jumlah block (default: 10, max: 100)" },
      { name: "offset", type: "number", required: false, desc: "Offset untuk pagination" },
    ],
    response: `[{
  "height": 150234,
  "hash": "0x...",
  "timestamp": "2026-03-20T10:30:00Z",
  "miner": "GRD1q...",
  "transactionCount": 5,
  "size": 1250,
  "gasUsed": 21000,
  "gasLimit": 8000000
}]`,
    example: `curl https://explorer.garudachain.org/api/blocks?limit=10`,
  },
  {
    method: "GET", path: "/api/block/:height", desc: "Mendapatkan detail block berdasarkan tinggi block",
    params: [{ name: "height", type: "number", required: true, desc: "Tinggi block" }],
    response: `{
  "height": 150234,
  "hash": "0x...",
  "parentHash": "0x...",
  "timestamp": "2026-03-20T10:30:00Z",
  "miner": "GRD1q...",
  "transactionCount": 5,
  "transactions": [...],
  "size": 1250,
  "gasUsed": 21000,
  "gasLimit": 8000000
}`,
    example: `curl https://explorer.garudachain.org/api/block/150234`,
  },
  {
    method: "GET", path: "/api/transactions", desc: "Mendapatkan daftar transaksi terbaru",
    params: [
      { name: "limit", type: "number", required: false, desc: "Jumlah transaksi (default: 10)" },
    ],
    response: `[{
  "hash": "0x...",
  "blockNumber": 150234,
  "from": "GRD1q...",
  "to": "GRD1q...",
  "value": "10.5",
  "fee": "0.001",
  "timestamp": "2026-03-20T10:30:00Z",
  "status": "confirmed"
}]`,
    example: `curl https://explorer.garudachain.org/api/transactions?limit=20`,
  },
  {
    method: "GET", path: "/api/tx/:hash", desc: "Mendapatkan detail transaksi berdasarkan hash",
    params: [{ name: "hash", type: "string", required: true, desc: "Transaction hash" }],
    response: `{
  "hash": "0x...",
  "blockNumber": 150234,
  "blockHash": "0x...",
  "from": "GRD1q...",
  "to": "GRD1q...",
  "value": "10.5",
  "fee": "0.001",
  "gasUsed": 21000,
  "gasPrice": "0.000001",
  "nonce": 42,
  "status": "confirmed",
  "data": "0x..."
}`,
    example: `curl https://explorer.garudachain.org/api/tx/0xabc123...`,
  },
  {
    method: "GET", path: "/api/address/:address", desc: "Mendapatkan informasi alamat (balance, transaksi)",
    params: [{ name: "address", type: "string", required: true, desc: "Alamat GarudaChain" }],
    response: `{
  "address": "GRD1q...",
  "balance": "1250.50",
  "transactionCount": 156,
  "firstSeen": "2025-06-15T00:00:00Z",
  "lastSeen": "2026-03-20T10:30:00Z",
  "transactions": [...]
}`,
    example: `curl https://explorer.garudachain.org/api/address/GRD1q8f4k2m9p3n7x5v6b1c0z2w4e6r8t0y`,
  },
  {
    method: "GET", path: "/api/search", desc: "Mencari block, transaksi, atau alamat",
    params: [{ name: "q", type: "string", required: true, desc: "Query pencarian (block number, tx hash, atau address)" }],
    response: `{
  "type": "block" | "transaction" | "address",
  "result": { ... }
}`,
    example: `curl https://explorer.garudachain.org/api/search?q=150234`,
  },
  {
    method: "GET", path: "/api/health", desc: "Cek status kesehatan API dan koneksi ke node",
    response: `{
  "status": "ok",
  "blockHeight": 150234,
  "nodeVersion": "GarudaChain v28.1",
  "uptime": "99.9%"
}`,
    example: `curl https://explorer.garudachain.org/api/health`,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-muted-foreground hover:text-foreground transition-colors p-1"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function ApiDocs() {
  const [activeEndpoint, setActiveEndpoint] = useState(0);

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Code2 className="w-7 h-7" />
            <h1 className="text-2xl font-bold">API Documentation</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            RESTful API untuk mengakses data blockchain GarudaChain. Gratis untuk penggunaan publik
            dengan rate limit 100 request/menit. Semua response dalam format JSON.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Quick Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-primary" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Base URL</p>
            </div>
            <p className="text-[13px] font-mono font-semibold text-foreground">explorer.garudachain.org</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-emerald-600" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Rate Limit</p>
            </div>
            <p className="text-[13px] font-semibold text-foreground">100 req/menit</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-blue-600" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Auth</p>
            </div>
            <p className="text-[13px] font-semibold text-foreground">Tidak perlu API Key</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-purple-600" />
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Format</p>
            </div>
            <p className="text-[13px] font-semibold text-foreground">JSON (REST)</p>
          </div>
        </div>

        {/* Quick Start */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            Quick Start
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { lang: "cURL", code: `curl https://explorer.garudachain.org/api/stats` },
              { lang: "JavaScript", code: `const res = await fetch(
  'https://explorer.garudachain.org/api/stats'
);
const data = await res.json();
console.log(data.latestBlock);` },
              { lang: "Python", code: `import requests

r = requests.get(
  'https://explorer.garudachain.org/api/stats'
)
data = r.json()
print(data['latestBlock'])` },
            ].map(ex => (
              <div key={ex.lang}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-foreground">{ex.lang}</span>
                  <CopyButton text={ex.code} />
                </div>
                <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-3 text-[11px] font-mono overflow-x-auto">
                  {ex.code}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Endpoints */}
        <h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
          <Book className="w-5 h-5 text-primary" />
          API Endpoints
        </h3>

        <div className="space-y-4 mb-6">
          {ENDPOINTS.map((ep, idx) => (
            <div key={ep.path} className="bg-white border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveEndpoint(activeEndpoint === idx ? -1 : idx)}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    ep.method === "GET" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {ep.method}
                  </span>
                  <span className="text-[14px] font-mono font-semibold text-foreground">{ep.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground hidden md:inline">{ep.desc}</span>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${activeEndpoint === idx ? "rotate-90" : ""}`} />
                </div>
              </button>

              {activeEndpoint === idx && (
                <div className="border-t border-border px-5 py-4 space-y-4">
                  <p className="text-[13px] text-muted-foreground">{ep.desc}</p>

                  {ep.params && (
                    <div>
                      <p className="text-[12px] font-semibold text-foreground mb-2">Parameters</p>
                      <table className="w-full text-[12px]">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Name</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Type</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Required</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {ep.params.map(p => (
                            <tr key={p.name}>
                              <td className="px-3 py-2 font-mono font-semibold text-primary">{p.name}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{p.type}</td>
                              <td className="px-3 py-2">
                                {p.required ? <span className="text-red-600 font-semibold">Yes</span> : <span className="text-muted-foreground">No</span>}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{p.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-semibold text-foreground">Example Request</p>
                      <CopyButton text={ep.example} />
                    </div>
                    <pre className="bg-[#1e1e2e] text-[#a6e3a1] rounded-lg p-3 text-[11px] font-mono overflow-x-auto">
                      {ep.example}
                    </pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-semibold text-foreground">Response</p>
                      <CopyButton text={ep.response} />
                    </div>
                    <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-3 text-[11px] font-mono overflow-x-auto">
                      {ep.response}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* SDK & Libraries */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3">SDK & Libraries</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { lang: "JavaScript/TypeScript", pkg: "npm install @garudachain/sdk", desc: "Official SDK untuk Node.js dan browser" },
              { lang: "Python", pkg: "pip install garudachain", desc: "Python client untuk GarudaChain API" },
              { lang: "Go", pkg: "go get github.com/garudachain/go-sdk", desc: "Go client untuk integrasi backend" },
            ].map(sdk => (
              <div key={sdk.lang} className="bg-gray-50 rounded-lg p-3">
                <p className="text-[12px] font-semibold text-foreground mb-1">{sdk.lang}</p>
                <pre className="text-[11px] font-mono text-primary bg-white rounded px-2 py-1 mb-1">{sdk.pkg}</pre>
                <p className="text-[11px] text-muted-foreground">{sdk.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Rate Limits */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3">Rate Limits & Error Codes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[12px] font-semibold text-foreground mb-2">Rate Limits</p>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Public (tanpa API key)</span>
                  <span className="font-semibold">100 req/menit</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Registered (API key)</span>
                  <span className="font-semibold">500 req/menit</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Enterprise</span>
                  <span className="font-semibold">Unlimited</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-foreground mb-2">HTTP Error Codes</p>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="font-mono text-emerald-600">200</span>
                  <span className="text-muted-foreground">OK — Request berhasil</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="font-mono text-amber-600">400</span>
                  <span className="text-muted-foreground">Bad Request — Parameter tidak valid</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="font-mono text-red-600">404</span>
                  <span className="text-muted-foreground">Not Found — Resource tidak ditemukan</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-mono text-red-600">429</span>
                  <span className="text-muted-foreground">Too Many Requests — Rate limit exceeded</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RPC Node */}
        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Direct RPC Node Access
          </h3>
          <p className="text-[12px] text-muted-foreground mb-3">
            Untuk akses langsung ke node GarudaChain (Bitcoin Core v28.1 fork), gunakan JSON-RPC:
          </p>
          <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-3 text-[11px] font-mono overflow-x-auto mb-3">
{`curl --user <rpcuser>:<rpcpass> \\
  --data-binary '{"jsonrpc":"1.0","id":1,"method":"getblockcount","params":[]}' \\
  -H 'content-type:text/plain;' \\
  http://<node-ip>:9446/`}
          </pre>
          <p className="text-[11px] text-muted-foreground">
            Hubungi tim GarudaChain untuk mendapatkan akses RPC node. Tersedia public RPC endpoint dan dedicated node.
          </p>
        </div>
      </div>
    </Layout>
  );
}
