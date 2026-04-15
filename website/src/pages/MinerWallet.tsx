import { Layout } from "@/components/Layout";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { formatNumber, truncateHash, formatTimeAgo } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import {
  Wallet, Search, ArrowUpRight, ArrowDownLeft, Pickaxe,
  Landmark, Copy, Check, ExternalLink, ChevronLeft, Coins,
} from "lucide-react";
import { AssetLogo } from "@/components/AssetLogo";

interface WalletInfo {
  address: string;
  label: string;
  balance: number;
  idrtBalance: number;
  txCount: number;
  type: string;
  firstSeen: number;
  lastSeen: number;
  utxoCount: number;
}

interface TokenHolding {
  symbol: string;
  name: string;
  assetId: string;
  balance: number;
  type: string;
  price: string | null;
  priceStable: boolean;
}

interface WalletDetail {
  address: string;
  label: string;
  type: string;
  balance: number;
  utxoCount: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  firstSeen: number;
  lastSeen: number;
  tokens: TokenHolding[];
  transactions: TxRecord[];
}

interface TxRecord {
  hash: string;
  blockNumber: number;
  timestamp: string;
  type: string;
  value: number;
  counterparty: string;
  confirmations: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 hover:bg-gray-100 rounded transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    miner: "bg-amber-100 text-amber-700",
    apbn: "bg-blue-100 text-blue-700",
    user: "bg-gray-100 text-gray-600",
  };
  const icons: Record<string, React.ReactNode> = {
    miner: <Pickaxe className="w-3 h-3" />,
    apbn: <Landmark className="w-3 h-3" />,
    user: <Wallet className="w-3 h-3" />,
  };
  const labels: Record<string, string> = {
    miner: "Miner",
    apbn: "APBN Treasury",
    user: "User",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${styles[type] || styles.user}`}>
      {icons[type] || icons.user} {labels[type] || "User"}
    </span>
  );
}

function TxTypeBadge({ type }: { type: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    mining: { icon: <Pickaxe className="w-3 h-3" />, label: "Mining", cls: "bg-amber-100 text-amber-700" },
    apbn_fee: { icon: <Landmark className="w-3 h-3" />, label: "APBN Fee", cls: "bg-blue-100 text-blue-700" },
    receive: { icon: <ArrowDownLeft className="w-3 h-3" />, label: "Receive", cls: "bg-emerald-100 text-emerald-700" },
    send: { icon: <ArrowUpRight className="w-3 h-3" />, label: "Send", cls: "bg-red-100 text-red-700" },
    self: { icon: <ExternalLink className="w-3 h-3" />, label: "Self", cls: "bg-gray-100 text-gray-600" },
  };
  const c = config[type] || config.receive;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ===== WALLET LIST =====
function WalletList({ onSelect }: { onSelect: (addr: string) => void }) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(apiUrl("/api/blockchain/wallets?scan=500"))
      .then(r => r.json())
      .then(data => {
        const parsed = Array.isArray(data) ? data.map((w: any) => ({ ...w, balance: parseFloat(w.balance) || 0 })) : data;
        setWallets(parsed);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = wallets.filter(w =>
    w.address.toLowerCase().includes(search.toLowerCase()) ||
    w.label.toLowerCase().includes(search.toLowerCase()) ||
    w.type.toLowerCase().includes(search.toLowerCase())
  );

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-7 h-7" />
            <h1 className="text-2xl font-bold">Wallet Explorer</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            Daftar semua wallet yang tercatat di GarudaChain. Klik wallet untuk melihat detail aset dan riwayat transaksi.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Total Wallets</p>
            <p className="text-xl font-bold">{formatNumber(wallets.length)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Total Balance</p>
            <p className="text-xl font-bold">{formatNumber(totalBalance.toFixed(4))} GRD</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Miners</p>
            <p className="text-xl font-bold">{wallets.filter(w => w.type === "miner").length}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">APBN Treasury</p>
            <p className="text-xl font-bold">{formatNumber((wallets.find(w => w.type === "apbn")?.balance ?? 0).toFixed(4))} GRD</p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari alamat wallet..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Type</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Balance (GRD)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">IDR-T</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Txns</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">First Seen</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Loading wallets dari blockchain...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Tidak ada wallet ditemukan</td></tr>
                ) : filtered.map((w, idx) => (
                  <tr
                    key={w.address}
                    className="hover:bg-red-50/30 cursor-pointer transition-colors"
                    onClick={() => onSelect(w.address)}
                  >
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-blue-600 hover:underline">
                          {truncateHash(w.address, 12, 8)}
                        </span>
                        {w.label && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{w.label}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={w.type} /></td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(w.balance.toFixed(4))}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {w.idrtBalance > 0 ? (
                        <span className="text-emerald-600 font-semibold">{formatNumber(w.idrtBalance)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(w.txCount)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">Block #{formatNumber(w.firstSeen)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">Block #{formatNumber(w.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ===== WALLET DETAIL =====
function WalletDetailView({ address, onBack }: { address: string; onBack: () => void }) {
  const [detail, setDetail] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl(`/api/blockchain/wallet/${address}`))
      .then(r => r.json())
      .then(data => {
        setDetail({
          address: data.address ?? "",
          label: data.label ?? "",
          type: data.type ?? "user",
          balance: parseFloat(data.balance) || 0,
          utxoCount: data.utxoCount ?? 0,
          totalReceived: parseFloat(data.totalReceived) || 0,
          totalSent: parseFloat(data.totalSent) || 0,
          txCount: data.transactionCount ?? data.txCount ?? 0,
          firstSeen: data.firstSeen ?? 0,
          lastSeen: data.lastSeen ?? 0,
          tokens: Array.isArray(data.portfolio) ? data.portfolio : (data.tokens ?? []),
          transactions: Array.isArray(data.transactions) ? data.transactions.map((tx: any) => ({
            hash: tx.hash ?? tx.txid ?? "",
            blockNumber: tx.blockNumber ?? tx.block ?? 0,
            timestamp: tx.timestamp ?? "",
            type: tx.type ?? "unknown",
            value: parseFloat(tx.value ?? tx.amount) || 0,
            counterparty: tx.counterparty ?? tx.address ?? "",
            confirmations: tx.confirmations ?? 0,
          })) : [],
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address]);

  if (loading) {
    return <div className="container mx-auto px-4 py-20 text-center text-gray-400">Loading wallet detail...</div>;
  }
  if (!detail) {
    return <div className="container mx-auto px-4 py-20 text-center text-gray-400">Wallet not found</div>;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <button onClick={onBack} className="flex items-center gap-1 text-white/70 hover:text-white text-sm mb-3 transition">
            <ChevronLeft className="w-4 h-4" /> Kembali ke daftar wallet
          </button>
          <div className="flex items-center gap-3 mb-1">
            {detail.type === "apbn" ? <Landmark className="w-6 h-6" /> :
             detail.type === "miner" ? <Pickaxe className="w-6 h-6" /> :
             <Wallet className="w-6 h-6" />}
            <h1 className="text-xl font-bold">{detail.label || "Account"}</h1>
            <TypeBadge type={detail.type} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-mono text-sm text-white/80">{detail.address}</span>
            <CopyButton text={detail.address} />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Token Holdings */}
        <div className="bg-white border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold mb-4 flex items-center gap-2">
            <Coins className="w-4 h-4 text-primary" />
            Token Holdings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* GRD Native */}
            <div className="border rounded-lg p-4 bg-gradient-to-r from-red-50/50 to-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <AssetLogo symbol="GRD" size={32} tipe="NATIVE" />
                  <div>
                    <p className="text-[13px] font-semibold">Garuda Rupiah Digital</p>
                    <p className="text-[11px] text-gray-500">Native Token</p>
                  </div>
                </div>
                <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold">Native</span>
              </div>
              <p className="text-xl font-bold font-mono">{formatNumber(detail.balance.toFixed(8))} <span className="text-[13px] text-gray-500">GRD</span></p>
            </div>

            {/* Other Tokens (IDR-T, etc) */}
            {detail.tokens && detail.tokens.length > 0 ? detail.tokens.map(token => (
              <div key={token.assetId} className={`border rounded-lg p-4 ${token.priceStable ? "bg-gradient-to-r from-emerald-50/50 to-white" : "bg-gradient-to-r from-blue-50/50 to-white"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <AssetLogo symbol={token.symbol} size={32} tipe={token.priceStable ? "STABLECOIN" : "SAHAM"} />
                    <div>
                      <p className="text-[13px] font-semibold">{token.name}</p>
                      <p className="text-[11px] text-gray-500">{token.type}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${token.priceStable ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
                    {token.priceStable ? "Stablecoin" : token.type}
                  </span>
                </div>
                <p className="text-xl font-bold font-mono">{formatNumber(token.balance)} <span className="text-[13px] text-gray-500">{token.symbol}</span></p>
                {token.priceStable && (
                  <p className="text-[11px] text-emerald-600 mt-1 font-medium">Pegged 1:1 ke Rupiah — {token.price} per token</p>
                )}
              </div>
            )) : (
              <div className="border rounded-lg p-4 bg-gray-50/50 flex items-center justify-center">
                <p className="text-[12px] text-gray-400">Tidak ada token lain</p>
              </div>
            )}
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-5">
            <p className="text-[11px] text-gray-500 uppercase font-semibold mb-1">GRD Balance</p>
            <p className="text-2xl font-bold">{formatNumber(detail.balance.toFixed(8))} GRD</p>
          </div>
          <div className="bg-white border rounded-lg p-5">
            <p className="text-[11px] text-gray-500 uppercase font-semibold mb-1">Total Received</p>
            <p className="text-xl font-bold text-emerald-600">+{formatNumber(detail.totalReceived.toFixed(8))} GRD</p>
          </div>
          <div className="bg-white border rounded-lg p-5">
            <p className="text-[11px] text-gray-500 uppercase font-semibold mb-1">Total Sent</p>
            <p className="text-xl font-bold text-red-600">-{formatNumber(detail.totalSent.toFixed(8))} GRD</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Transactions</p>
            <p className="text-lg font-bold">{formatNumber(detail.txCount)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">UTXOs</p>
            <p className="text-lg font-bold">{formatNumber(detail.utxoCount)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">First Seen</p>
            <p className="text-lg font-bold">Block #{formatNumber(detail.firstSeen)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Last Active</p>
            <p className="text-lg font-bold">Block #{formatNumber(detail.lastSeen)}</p>
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="text-[14px] font-bold">Transactions</h3>
            <span className="text-[12px] text-gray-500">{detail.txCount} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Tx Hash</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Time</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Action</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">By</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Value (GRD)</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Block</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.transactions.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Tidak ada transaksi</td></tr>
                ) : detail.transactions.map(tx => (
                  <tr key={tx.hash} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/tx/${tx.hash}`} className="font-mono text-[12px] text-blue-600 hover:underline">
                        {truncateHash(tx.hash, 10, 6)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[12px]">{formatTimeAgo(tx.timestamp)}</td>
                    <td className="px-4 py-3"><TxTypeBadge type={tx.type} /></td>
                    <td className="px-4 py-3">
                      {tx.counterparty === "Coinbase" ? (
                        <span className="text-[12px] text-amber-600 font-medium">Coinbase</span>
                      ) : tx.counterparty ? (
                        <span className="font-mono text-[12px] text-blue-600">{truncateHash(tx.counterparty, 8, 6)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      <span className={tx.type === "send" ? "text-red-600" : "text-emerald-600"}>
                        {tx.type === "send" ? "-" : "+"}{formatNumber(tx.value.toFixed(8))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/block/${tx.blockNumber}`} className="text-blue-600 hover:underline text-[12px]">
                        #{formatNumber(tx.blockNumber)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ===== MAIN =====
export function MinerWallet() {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  return (
    <Layout>
      {selectedAddress ? (
        <WalletDetailView address={selectedAddress} onBack={() => setSelectedAddress(null)} />
      ) : (
        <WalletList onSelect={setSelectedAddress} />
      )}
    </Layout>
  );
}
