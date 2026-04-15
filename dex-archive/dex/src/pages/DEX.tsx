import { useState, useRef, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api-config";
import { BarChart3, ArrowRightLeft, Wallet, ArrowDownUp, X, Info, ChevronDown, Search, Settings, FileText, ArrowLeft, Globe, ArrowUpRight, ArrowDownLeft, Copy, Check, LogOut, ExternalLink, CreditCard, Smartphone, QrCode, Building2, Send } from "lucide-react";
import { PriceChart } from "@/components/dex/PriceChart";
import { AssetLogo } from "@/components/AssetLogo";
import { OrderbookCard } from "@/components/dex/OrderbookCard";
import { OrderForm } from "@/components/dex/OrderForm";
import { TradeHistoryCard } from "@/components/dex/TradeHistoryCard";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const RED = "#8B0000";

// ─── Hyperliquid-style Wallet: L1 wallet + DEX trading account ───
interface WalletState {
  isConnected: boolean;
  // L1 wallet (external — extension or imported address)
  l1Address: string;
  l1BalanceGrd: number;
  l1Type: "extension" | "address" | "node" | "";
  // DEX trading account (generated on-chain, holds trading funds)
  address: string; // trading address
  balanceGrd: number; // trading balance
  assets: { asset_id: string; symbol: string; balance: number }[];
  loading: boolean;
}

function useDexWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false, l1Address: "", l1BalanceGrd: 0, l1Type: "",
    address: "", balanceGrd: 0, assets: [], loading: false,
  });

  // Fetch balance for any address
  const fetchBalance = async (addr: string) => {
    const res = await fetch(apiUrl(`/api/dex/wallet/connect?address=${addr}`)).then(r => r.json());
    return res;
  };

  // Step 1: Connect L1 wallet (external)
  // Step 2: Auto-create or reconnect DEX trading account
  const connectWithL1 = useCallback(async (l1Addr: string, type: "extension" | "address" | "node") => {
    setWallet(prev => ({ ...prev, loading: true }));
    try {
      // Fetch L1 balance
      const l1Info = await fetchBalance(l1Addr);
      const l1Bal = l1Info.balance_grd ?? 0;

      // Check if user already has a trading account
      let tradingAddr = localStorage.getItem("garuda_dex_trading_" + l1Addr);
      let tradingInfo: any;

      if (tradingAddr) {
        tradingInfo = await fetchBalance(tradingAddr);
      } else {
        // Create new trading account
        const label = "trading-" + l1Addr.slice(0, 12);
        const res = await fetch(apiUrl("/api/dex/wallet/create"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }).then(r => r.json());
        tradingAddr = res.address;
        tradingInfo = res;
        if (tradingAddr) {
          localStorage.setItem("garuda_dex_trading_" + l1Addr, tradingAddr);
        }
      }

      if (tradingAddr && tradingInfo) {
        setWallet({
          isConnected: true,
          l1Address: l1Addr,
          l1BalanceGrd: l1Bal,
          l1Type: type,
          address: tradingAddr,
          balanceGrd: tradingInfo.balance_grd ?? 0,
          assets: tradingInfo.assets || [],
          loading: false,
        });
        localStorage.setItem("garuda_dex_connected", "true");
        localStorage.setItem("garuda_dex_l1", l1Addr);
        localStorage.setItem("garuda_dex_l1_type", type);
      } else {
        setWallet(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setWallet(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Legacy connect (auto-create node wallet as both L1 and trading)
  const connect = useCallback(async () => {
    setWallet(prev => ({ ...prev, loading: true }));
    try {
      const label = "user-" + Math.random().toString(36).slice(2, 10);
      const res = await fetch(apiUrl("/api/dex/wallet/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      }).then(r => r.json());
      if (res.address) {
        await connectWithL1(res.address, "node");
      } else {
        setWallet(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setWallet(prev => ({ ...prev, loading: false }));
    }
  }, [connectWithL1]);

  const disconnect = useCallback(() => {
    setWallet({ isConnected: false, l1Address: "", l1BalanceGrd: 0, l1Type: "", address: "", balanceGrd: 0, assets: [], loading: false });
    localStorage.removeItem("garuda_dex_connected");
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!wallet.address) return;
    try {
      const [tradingInfo, l1Info] = await Promise.all([
        fetchBalance(wallet.address),
        wallet.l1Address ? fetchBalance(wallet.l1Address) : Promise.resolve(null),
      ]);
      if (tradingInfo.connected) {
        setWallet(prev => ({
          ...prev,
          balanceGrd: tradingInfo.balance_grd ?? prev.balanceGrd,
          assets: tradingInfo.assets || prev.assets,
          l1BalanceGrd: l1Info?.balance_grd ?? prev.l1BalanceGrd,
        }));
      }
    } catch { /* ignore */ }
  }, [wallet.address, wallet.l1Address]);

  // Deposit GRD from L1 → trading account
  const deposit = useCallback(async (amount: number) => {
    if (!wallet.l1Address || !wallet.address || amount <= 0) return { error: "Invalid" };
    // Prefer client-side signing via extension (Web3 pattern)
    const provider = (window as any).garuda;
    if (provider?.isGarudaChain && wallet.l1Type === "extension") {
      try {
        const res = await provider.sendTransaction({
          from: wallet.l1Address,
          to: wallet.address,
          amount,
          kind: "deposit",
        });
        await refreshBalance();
        return { status: "ok", ...res };
      } catch (err: any) {
        return { error: err?.message || "Transaksi ditolak" };
      }
    }
    // Fallback: server-side (dev/testing only)
    const res = await fetch(apiUrl("/api/dex/deposit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_address: wallet.l1Address, to_address: wallet.address, amount }),
    }).then(r => r.json());
    if (res.status === "ok") await refreshBalance();
    return res;
  }, [wallet.l1Address, wallet.address, wallet.l1Type, refreshBalance]);

  // Withdraw GRD from trading account → L1
  // Note: Trading account is custodied by the operator (Hyperliquid model),
  // so withdrawal is processed server-side. In Phase 2+ this will require a
  // signed authorization message from the L1 key via window.garuda.signMessage.
  const withdraw = useCallback(async (amount: number) => {
    if (!wallet.l1Address || !wallet.address || amount <= 0) return { error: "Invalid" };
    const res = await fetch(apiUrl("/api/dex/withdraw"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_address: wallet.address, to_address: wallet.l1Address, amount }),
    }).then(r => r.json());
    if (res.status === "ok") await refreshBalance();
    return res;
  }, [wallet.l1Address, wallet.address, refreshBalance]);

  // Connect with address (for extension/import — goes through L1 flow)
  const connectWithAddress = useCallback(async (addr: string) => {
    await connectWithL1(addr, "address");
  }, [connectWithL1]);

  // Auto-reconnect
  useEffect(() => {
    const wasConnected = localStorage.getItem("garuda_dex_connected");
    const savedL1 = localStorage.getItem("garuda_dex_l1");
    const savedType = localStorage.getItem("garuda_dex_l1_type") as "extension" | "address" | "node" | null;
    if (wasConnected === "true" && savedL1) {
      connectWithL1(savedL1, savedType || "address");
    }
  }, [connectWithL1]);

  return { ...wallet, connect, connectWithL1, connectWithAddress, disconnect, refreshBalance, deposit, withdraw };
}

// ─── Hyperliquid-style Connect Wallet Modal ───
function ConnectWalletModal({ open, onClose, wallet }: {
  open: boolean;
  onClose: () => void;
  wallet: ReturnType<typeof useDexWallet>;
}) {
  const [mode, setMode] = useState<"select" | "address" | "connecting" | "success">("select");
  const [inputAddr, setInputAddr] = useState("");
  const [error, setError] = useState("");
  const [connectingName, setConnectingName] = useState("");
  const [hasExtension, setHasExtension] = useState(false);

  useEffect(() => {
    if (!open) return;
    const check = () => setHasExtension(!!(window as any).garuda?.isGarudaChain);
    check();
    const handler = () => check();
    window.addEventListener("garuda#initialized", handler);
    return () => window.removeEventListener("garuda#initialized", handler);
  }, [open]);

  useEffect(() => {
    if (open) { setMode("select"); setError(""); setInputAddr(""); setConnectingName(""); }
  }, [open]);

  if (!open) return null;

  const handleExtensionConnect = async () => {
    setMode("connecting");
    setConnectingName("GarudaChain Extension");
    setError("");
    try {
      const garuda = (window as any).garuda;
      if (!garuda) { setError("Extension tidak terdeteksi"); setMode("select"); return; }
      const accounts: string[] = await garuda.requestAccounts();
      if (accounts && accounts.length > 0) {
        await wallet.connectWithL1(accounts[0], "extension");
        setMode("success");
        setTimeout(() => onClose(), 1500);
      } else {
        setError("Koneksi ditolak atau tidak ada akun");
        setMode("select");
      }
    } catch (e: any) {
      setError(e?.message || "Gagal menghubungkan extension");
      setMode("select");
    }
  };

  const handleCreateWallet = async () => {
    setMode("connecting");
    setConnectingName("Node Wallet");
    setError("");
    await wallet.connect();
    setMode("success");
    setTimeout(() => onClose(), 1500);
  };

  const handleConnectAddress = async () => {
    if (!inputAddr.trim()) { setError("Masukkan alamat wallet"); return; }
    setMode("connecting");
    setConnectingName("Wallet");
    setError("");
    await wallet.connectWithL1(inputAddr.trim(), "address");
    setMode("success");
    setTimeout(() => onClose(), 1500);
  };

  type WalletOpt = { id: string; icon: string | React.ReactNode; name: string; desc: string; recommended?: boolean; disabled?: boolean; badge?: string; installed?: boolean };
  const WALLET_OPTIONS: WalletOpt[] = [
    ...(hasExtension ? [{
      id: "extension", icon: "🦅", name: "GarudaChain Wallet", desc: "Browser extension terdeteksi", recommended: true, installed: true,
    }] : [{
      id: "extension-install", icon: "🦅", name: "GarudaChain Wallet", desc: "Install browser extension", recommended: true, badge: "Install",
    }]),
    { id: "garuda-node", icon: "🔗", name: "Node Wallet", desc: "Buat wallet langsung di GarudaChain node" },
    { id: "address", icon: "📋", name: "Import Address", desc: "Masukkan alamat wallet yang sudah ada" },
    { id: "garuda-desktop", icon: "🖥️", name: "Garuda Desktop", desc: "Wallet desktop GarudaChain", disabled: true, badge: "Coming Soon" },
    { id: "garuda-mobile", icon: "📱", name: "Garuda Mobile", desc: "Wallet mobile GarudaChain", disabled: true, badge: "Coming Soon" },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {mode === "address" ? "Import Address" : mode === "connecting" ? "Connecting..." : mode === "success" ? "Connected" : "Connect Wallet"}
            </h2>
            {mode === "select" && (
              <p className="text-sm text-muted-foreground mt-1">Hubungkan wallet L1 untuk trading di GarudaDEX</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success */}
        {mode === "success" ? (
          <div className="px-6 pb-8 flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground mb-1">Wallet Terhubung</p>
              <p className="text-xs text-muted-foreground">Trading account telah dibuat otomatis.</p>
              <p className="text-xs text-muted-foreground mt-1">Deposit GRD dari L1 wallet untuk mulai trading.</p>
            </div>
            {/* Account summary */}
            <div className="w-full space-y-2 mt-2">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground">L1 Wallet</span>
                </div>
                <span className="text-xs font-mono font-semibold">{wallet.l1Address.slice(0, 10)}...{wallet.l1Address.slice(-4)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground">Trading Account</span>
                </div>
                <span className="text-xs font-mono font-semibold">{wallet.address.slice(0, 10)}...{wallet.address.slice(-4)}</span>
              </div>
            </div>
          </div>
        ) : mode === "connecting" ? (
          <div className="px-6 pb-8 flex flex-col items-center gap-5 py-10">
            {/* Lighter-style: logo with spinning arc */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              {/* Spinning arc */}
              <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 80 80" style={{ animationDuration: "1.2s" }}>
                <path d="M40 4 A36 36 0 0 1 76 40" fill="none" stroke="#8B0000" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {/* Logo in center */}
              <img src="/garuda.svg" alt="GarudaChain" className="w-10 h-10 relative z-10" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.querySelector("span")!.style.display = "block"; }} />
              <span className="text-3xl relative z-10 hidden">🦅</span>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-foreground">Connect</p>
              <p className="text-sm text-muted-foreground mt-2">Click connect in your wallet popup</p>
            </div>
          </div>
        ) : mode === "address" ? (
          <div className="px-6 pb-6">
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground mb-2 block">Alamat Wallet L1</label>
              <input
                type="text"
                value={inputAddr}
                onChange={(e) => { setInputAddr(e.target.value); setError(""); }}
                placeholder="grd1q... atau bcrt1q..."
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-[#8B0000] focus:ring-2 focus:ring-[#8B0000]/10 transition-all font-mono"
                autoFocus
              />
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-[11px] text-blue-700 leading-relaxed">
                <Info className="w-3 h-3 inline mr-1" />
                Alamat ini akan menjadi <strong>L1 wallet</strong> Anda. Sistem akan otomatis membuat <strong>trading account</strong> terpisah untuk trading di DEX.
              </p>
            </div>
            <button
              onClick={handleConnectAddress}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-colors"
            >
              Connect & Create Trading Account
            </button>
            <button
              onClick={() => { setMode("select"); setError(""); setInputAddr(""); }}
              className="w-full py-2 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Kembali
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6">
            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
            )}
            <div className="space-y-2">
              {WALLET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  disabled={opt.disabled}
                  onClick={() => {
                    if (opt.id === "extension") handleExtensionConnect();
                    else if (opt.id === "extension-install") {
                      const g = (window as any).garuda;
                      if (g?.isGarudaChain) { setHasExtension(true); handleExtensionConnect(); }
                      else {
                        window.open("chrome://extensions", "_blank");
                        setError("Extension belum terinstall. Load unpacked dari folder extension/dist. Lalu refresh.");
                      }
                    }
                    else if (opt.id === "garuda-node") handleCreateWallet();
                    else if (opt.id === "address") setMode("address");
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left group ${
                    opt.disabled
                      ? "border-border/50 opacity-50 cursor-not-allowed bg-gray-50"
                      : opt.installed
                        ? "border-[#8B0000]/30 bg-red-50/30 hover:border-[#8B0000]/60 hover:bg-red-50 hover:shadow-md cursor-pointer"
                        : "border-border hover:border-[#8B0000]/40 hover:bg-red-50/50 hover:shadow-sm cursor-pointer"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-colors ${
                    opt.installed ? "bg-[#8B0000]/10 group-hover:bg-[#8B0000]/20" : "bg-gray-100 group-hover:bg-white"
                  }`}>
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{opt.name}</span>
                      {opt.installed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Installed</span>}
                      {opt.badge && !opt.installed && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-muted-foreground">{opt.badge}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                  {!opt.disabled && <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 shrink-0" />}
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Dengan menghubungkan wallet, Anda menyetujui <span className="text-[#8B0000] font-medium">Ketentuan Layanan</span> dan <span className="text-[#8B0000] font-medium">Kebijakan Privasi</span> GarudaDEX.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Deposit/Withdraw Modal (Hyperliquid-style) ───
function DepositWithdrawModal({ open, onClose, wallet, defaultTab = "deposit" }: {
  open: boolean;
  onClose: () => void;
  wallet: ReturnType<typeof useDexWallet>;
  defaultTab?: "deposit" | "withdraw";
}) {
  const [tab, setTab] = useState<"deposit" | "withdraw">(defaultTab);
  const [method, setMethod] = useState<"crypto" | "cash">("crypto");
  const [step, setStep] = useState<"select" | "amount">("select");
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) { setTab(defaultTab); setMethod("crypto"); setStep("select"); setAmount(""); setResult(null); }
  }, [open, defaultTab]);

  if (!open || !wallet.isConnected) return null;

  const maxAmount = tab === "deposit" ? wallet.l1BalanceGrd : wallet.balanceGrd;
  const parsedAmount = parseFloat(amount) || 0;

  const handleExecute = async () => {
    if (parsedAmount <= 0) return;
    if (parsedAmount > maxAmount) {
      toast({ title: "Saldo Tidak Cukup", description: `Maksimal: ${maxAmount.toFixed(8)} GRD`, variant: "destructive" });
      return;
    }
    setIsPending(true);
    setResult(null);
    try {
      const res = tab === "deposit"
        ? await wallet.deposit(parsedAmount)
        : await wallet.withdraw(parsedAmount);
      if (res.status === "ok" || res.connected) {
        const txid = res.txid || "";
        setResult({ ok: true, msg: `${tab === "deposit" ? "Deposit" : "Withdraw"} ${parsedAmount.toFixed(8)} GRD berhasil.${txid ? ` TX: ${txid.slice(0, 16)}...` : ""}` });
        setAmount("");
        toast({
          title: `${tab === "deposit" ? "Deposit" : "Withdraw"} Berhasil`,
          description: `${parsedAmount.toFixed(4)} GRD telah di-${tab === "deposit" ? "deposit" : "withdraw"}.`,
        });
      } else {
        setResult({ ok: false, msg: res.error || "Gagal" });
      }
    } catch {
      setResult({ ok: false, msg: "Gagal menghubungi server" });
    } finally {
      setIsPending(false);
    }
  };

  const handleMax = () => {
    const max = tab === "deposit" ? wallet.l1BalanceGrd : wallet.balanceGrd;
    setAmount(max > 0.0001 ? (max - 0.0001).toFixed(8) : "0");
  };

  const handlePct = (pct: number) => {
    setAmount((maxAmount * pct / 100).toFixed(8));
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0e1117] rounded-2xl shadow-2xl w-full max-w-[420px] mx-4 overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            {step === "amount" && (
              <button onClick={() => { setStep("select"); setResult(null); }} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-[15px] font-semibold text-white">
              {tab === "deposit" ? "Deposit GRD Perps" : "Withdraw GRD"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Token selector */}
        <div className="mx-5 mb-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-xs text-gray-400">Select destination token</span>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#C8922A] to-[#8B0000] flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">G</span>
              </div>
              <span className="text-sm font-semibold text-white">GRD</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
        </div>

        {tab === "deposit" && step === "select" && (
          <>
            {/* Method tabs: Use Crypto / Use Cash */}
            <div className="flex mx-5 mb-4 gap-2">
              {(["crypto", "cash"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    method === m
                      ? "bg-white/10 text-white border border-white/20"
                      : "bg-transparent text-gray-500 border border-white/5 hover:border-white/15 hover:text-gray-300"
                  }`}
                >
                  {m === "crypto" ? (
                    <>
                      <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-[8px]">₿</span>
                      </div>
                      Use Crypto
                    </>
                  ) : (
                    <>
                      <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CreditCard className="w-2.5 h-2.5 text-green-400" />
                      </div>
                      Use Cash
                    </>
                  )}
                </button>
              ))}
            </div>

            {/* Method options */}
            <div className="px-5 pb-5 space-y-1">
              {method === "crypto" ? (
                <>
                  {/* Wallet option */}
                  <button
                    onClick={() => setStep("amount")}
                    className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Wallet className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">Wallet ({wallet.l1Address.slice(0, 4)}...{wallet.l1Address.slice(-4)})</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400 font-mono">{wallet.l1BalanceGrd.toFixed(4)} GRD</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs text-gray-400">Instant</span>
                      </div>
                    </div>
                    {wallet.l1BalanceGrd <= 0 && (
                      <span className="text-[11px] text-gray-500 font-medium">Insufficient balance</span>
                    )}
                  </button>

                  {/* Transfer Crypto */}
                  <button
                    onClick={handleCopyAddress}
                    className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Send className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-white">Transfer Crypto</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400">No limit</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs text-gray-400">Instant</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#C8922A] to-[#8B0000] flex items-center justify-center">
                        <span className="text-[6px] font-bold text-white">G</span>
                      </div>
                    </div>
                  </button>

                  {/* Connect Exchange */}
                  <button className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-white">Connect Exchange</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400">No limit</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs text-gray-400">~2 min</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                  </button>
                </>
              ) : (
                <>
                  {/* QRIS */}
                  <button className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-white">QRIS</span>
                      <div className="text-xs text-gray-400 mt-0.5">Rp 5.000.000 limit • Instant</div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                  </button>

                  {/* Bank Transfer */}
                  <button className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-white">Bank Transfer</span>
                      <div className="text-xs text-gray-400 mt-0.5">No limit • Instant</div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                  </button>

                  {/* GoPay */}
                  <button className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-white">GoPay</span>
                      <div className="text-xs text-gray-400 mt-0.5">Rp 6.000.000 limit • Instant</div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                  </button>

                  {/* Card */}
                  <button className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-white/5 transition-all group opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-white">Card</span>
                      <div className="text-xs text-gray-400 mt-0.5">Rp 117.000.000 limit • Instant</div>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">Coming soon</span>
                  </button>
                </>
              )}

              {/* Copied toast */}
              {copied && (
                <div className="mt-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-xs text-emerald-400 font-medium">Deposit address copied to clipboard</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Amount entry step (for deposit from wallet) */}
        {tab === "deposit" && step === "amount" && (
          <div className="px-5 pb-5">
            {/* From → To flow */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">From</div>
                <div className="text-xs font-semibold text-white">L1 Wallet</div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">{wallet.l1Address.slice(0, 8)}...</div>
                <div className="text-xs font-bold font-mono text-[#C8922A] mt-1">{wallet.l1BalanceGrd.toFixed(4)} GRD</div>
              </div>
              <ArrowDownUp className="w-4 h-4 text-gray-500 shrink-0" />
              <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">To</div>
                <div className="text-xs font-semibold text-white">Trading Account</div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">{wallet.address.slice(0, 8)}...</div>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-400">Amount</label>
                <span className="text-[11px] text-gray-500">
                  Available: <span className="font-mono font-semibold text-gray-300">{maxAmount.toFixed(4)} GRD</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setResult(null); }}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none focus:border-[#C8922A] focus:ring-1 focus:ring-[#C8922A]/30 pr-20 placeholder:text-gray-600"
                  autoFocus
                />
                <button onClick={handleMax} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#C8922A] hover:text-[#e0a830] transition-colors px-2 py-1 rounded-md bg-[#C8922A]/10 hover:bg-[#C8922A]/20">
                  MAX
                </button>
              </div>
            </div>

            {/* Quick % buttons */}
            <div className="flex gap-2 mb-4">
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  onClick={() => handlePct(p)}
                  className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg border border-white/10 hover:border-[#C8922A]/40 hover:bg-[#C8922A]/5 transition-all text-gray-500 hover:text-[#C8922A]"
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Result */}
            {result && (
              <div className={`mb-4 p-3 rounded-xl text-xs ${result.ok ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                {result.msg}
              </div>
            )}

            {/* Execute button */}
            <button
              onClick={handleExecute}
              disabled={isPending || parsedAmount <= 0}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? "Processing..." : `Deposit ${parsedAmount > 0 ? parsedAmount.toFixed(4) : ""} GRD`}
            </button>

            {/* Info */}
            <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Deposit transfers GRD from your L1 wallet to your trading account. Funds in trading account are used for orders, swaps, and e-IPO.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Withdraw tab */}
        {tab === "withdraw" && (
          <div className="px-5 pb-5">
            {/* Tabs row for deposit/withdraw */}
            <div className="flex mb-4 gap-2">
              {(["deposit", "withdraw"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setAmount(""); setResult(null); setStep("select"); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    tab === t ? "bg-white/10 text-white border border-white/20" : "text-gray-500 border border-white/5"
                  }`}
                >
                  {t === "deposit" ? "Deposit" : "Withdraw"}
                </button>
              ))}
            </div>

            {/* From → To flow */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">From</div>
                <div className="text-xs font-semibold text-white">Trading Account</div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">{wallet.address.slice(0, 8)}...</div>
                <div className="text-xs font-bold font-mono text-[#C8922A] mt-1">{wallet.balanceGrd.toFixed(4)} GRD</div>
              </div>
              <ArrowDownUp className="w-4 h-4 text-gray-500 shrink-0" />
              <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">To</div>
                <div className="text-xs font-semibold text-white">L1 Wallet</div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">{wallet.l1Address.slice(0, 8)}...</div>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-400">Amount</label>
                <span className="text-[11px] text-gray-500">
                  Available: <span className="font-mono font-semibold text-gray-300">{wallet.balanceGrd.toFixed(4)} GRD</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setResult(null); }}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none focus:border-[#8B0000] focus:ring-1 focus:ring-[#8B0000]/30 pr-20 placeholder:text-gray-600"
                  autoFocus
                />
                <button onClick={handleMax} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#8B0000] hover:text-[#6B0000] transition-colors px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20">
                  MAX
                </button>
              </div>
            </div>

            {/* Quick % buttons */}
            <div className="flex gap-2 mb-4">
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  onClick={() => handlePct(p)}
                  className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg border border-white/10 hover:border-[#8B0000]/40 hover:bg-red-500/5 transition-all text-gray-500 hover:text-[#8B0000]"
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Result */}
            {result && (
              <div className={`mb-4 p-3 rounded-xl text-xs ${result.ok ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                {result.msg}
              </div>
            )}

            {/* Execute button */}
            <button
              onClick={handleExecute}
              disabled={isPending || parsedAmount <= 0}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? "Processing..." : `Withdraw ${parsedAmount > 0 ? parsedAmount.toFixed(4) : ""} GRD`}
            </button>

            {/* Info */}
            <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Withdraw transfers GRD from trading account back to your L1 wallet. Make sure you have no active open orders.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom deposit progress bar */}
        {isPending && (
          <div className="px-5 pb-4">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-blue-400 font-medium">You have 1 {tab} in progress...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Account Dropdown (Hyperliquid-style) ───
function AccountDropdown({ wallet, onDeposit, onWithdraw, onDisconnect }: {
  wallet: ReturnType<typeof useDexWallet>;
  onDeposit: () => void;
  onWithdraw: () => void;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"l1" | "trading" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const copyAddr = (addr: string, which: "l1" | "trading") => {
    navigator.clipboard.writeText(addr);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#8B0000]/30 bg-white hover:bg-red-50 transition-all"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-mono">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
        <span className="text-[#8B0000] font-bold font-mono">{wallet.balanceGrd.toFixed(2)} GRD</span>
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden z-50">
          {/* Trading Account */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-bold text-foreground">Trading Account</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-mono text-muted-foreground flex-1 truncate">{wallet.address}</span>
              <button onClick={() => copyAddr(wallet.address, "trading")} className="p-1 rounded hover:bg-gray-100">
                {copied === "trading" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
            <div className="bg-gradient-to-br from-[#8B0000] to-[#5a0000] rounded-xl p-3 text-white">
              <div className="text-[10px] opacity-70 uppercase tracking-wider mb-0.5">Trading Balance</div>
              <div className="text-lg font-bold font-mono">{wallet.balanceGrd.toFixed(4)} GRD</div>
            </div>
          </div>

          {/* L1 Wallet */}
          <div className="p-4 border-b border-border bg-gray-50/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs font-bold text-foreground">L1 Wallet</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{wallet.l1Type || "imported"}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-mono text-muted-foreground flex-1 truncate">{wallet.l1Address}</span>
              <button onClick={() => copyAddr(wallet.l1Address, "l1")} className="p-1 rounded hover:bg-gray-100">
                {copied === "l1" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
            <div className="text-sm font-bold font-mono text-foreground">{wallet.l1BalanceGrd.toFixed(4)} GRD</div>
          </div>

          {/* Actions */}
          <div className="p-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => { setOpen(false); onDeposit(); }}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Deposit
            </button>
            <button
              onClick={() => { setOpen(false); onWithdraw(); }}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-[#8B0000] border border-[#8B0000]/30 hover:bg-red-50 transition-colors"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Withdraw
            </button>
          </div>

          {/* Disconnect */}
          <div className="p-3 pt-0">
            <button
              onClick={() => { setOpen(false); onDisconnect(); }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Stock {
  symbol: string;
  name: string;
  assetId: string;
  tipe: string; // "SAHAM" | "STABLECOIN" | "ORACLE" | "NATIVE" | "OBLIGASI" | "REKSADANA"
  price: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume: number;
}

function fmt(v: number, d = 0) {
  if (v < 1) return v.toFixed(6) + " GRD";
  if (v < 100) return v.toFixed(4) + " GRD";
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + " GRD";
}

function fmtNum(v: number, d = 0) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

// Hook to fetch real stocks + pool data from on-chain API
function useOnChainStocks() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockHeight, setBlockHeight] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch stocks, stablecoins, stats, and oracle rates in parallel
        const [stocksRes, stablecoinsRes, statsRes, oracleRatesRes] = await Promise.all([
          fetch(apiUrl("/api/blockchain/stocks")).then(r => r.json()).catch(() => []),
          fetch(apiUrl("/api/blockchain/stablecoins")).then(r => r.json()).catch(() => []),
          fetch(apiUrl("/api/blockchain/stats")).then(r => r.json()).catch(() => ({})),
          fetch(apiUrl("/api/oracle/rates")).then(r => r.json()).catch(() => []),
        ]);
        // Build oracle rate map: symbol → grd_per_unit
        const oracleMap: Record<string, number> = {};
        if (Array.isArray(oracleRatesRes)) {
          for (const r of oracleRatesRes) {
            if (r.symbol && r.grd_per_unit > 0) oracleMap[r.symbol.toUpperCase()] = r.grd_per_unit;
          }
        }

        if (statsRes.latestBlock) setBlockHeight(statsRes.latestBlock);

        // Merge stablecoins into stocksRes format
        for (const sc of stablecoinsRes) {
          // Avoid duplicates
          if (!stocksRes.find((s: any) => s.assetId === sc.assetId)) {
            // Map tipe: stablecoin_pegged → ORACLE, stablecoin → STABLECOIN
            const rawTipe = (sc.tipe || "STABLECOIN").toUpperCase();
            const mappedTipe = rawTipe === "STABLECOIN_PEGGED" ? "ORACLE" : "STABLECOIN";
            stocksRes.push({
              kode: sc.symbol,
              nama: sc.name,
              assetId: sc.assetId,
              tipe: mappedTipe,
              totalSupply: sc.totalSupply,
              supply: sc.supply,
            });
          }
        }

        // Deduplicate by symbol (keep highest supply as primary)
        stocksRes.sort((a: any, b: any) => (b.totalSupply || b.supply || 0) - (a.totalSupply || a.supply || 0));
        const seenSymbol = new Set<string>();
        const uniqueStocks = stocksRes.filter((s: any) => {
          const key = (s.kode || s.symbol || "").toUpperCase();
          if (seenSymbol.has(key)) return false;
          seenSymbol.add(key);
          return true;
        });

        // For each stock, fetch orderbook + trade history for real price
        const stockList: Stock[] = [];
        for (const s of uniqueStocks) {
          // Skip NATIVE — will be added as hardcoded GRD entry
          if ((s.tipe || "").toUpperCase() === "NATIVE") continue;
          try {
            const [ob, trades] = await Promise.all([
              fetch(apiUrl(`/api/blockchain/orderbook/${s.assetId}`)).then(r => r.json()).catch(() => null),
              fetch(apiUrl(`/api/dex/trades/${s.assetId}`)).then(r => r.json()).catch(() => []),
            ]);
            // Last trade price
            const tradeList = Array.isArray(trades) ? trades : [];
            // Convert receh prices to GRD (on-chain returns receh if > 1000)
            const toGrd = (p: number) => p > 1000 ? p / 1e8 : p;
            const lastTrade = tradeList.length > 0 ? tradeList[tradeList.length - 1] : null;
            const lastPrice = toGrd(lastTrade?.price_grd ?? 0);
            // Best ask/bid
            const bestAsk = toGrd(ob?.asks?.[0]?.price_grd ?? 0);
            const bestBid = toGrd(ob?.bids?.[0]?.price_grd ?? 0);
            const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : (lastPrice || bestAsk || bestBid);
            // For stablecoins, use oracle rate (real-time) or fallback to 0.001
            const sym = (s.kode || "").toUpperCase();
            // Oracle pegged stablecoins use "p" prefix (e.g. pIDR) — strip for oracle map
            const oracleSym = sym.startsWith("P") && sym.length > 1 ? sym.slice(1) : sym;
            const oraclePrice = oracleMap[sym] ?? oracleMap[oracleSym] ?? 0;
            const rawTip = (s.tipe || "").toUpperCase();
            const tipUp = rawTip === "STABLECOIN_PEGGED" ? "ORACLE" : rawTip;
            const isStable = tipUp === "STABLECOIN" || tipUp === "ORACLE";
            const apiPrice = s.price ?? 0;
            const swapRate = isStable ? (oraclePrice > 0 ? oraclePrice : (apiPrice > 0 ? apiPrice : 0.001)) : 0;
            const spotPrice = lastPrice > 0 ? lastPrice : (midPrice > 0 ? midPrice : (swapRate > 0 ? swapRate : (apiPrice > 0 ? apiPrice : 1)));
            // Price range from trades
            const prices = tradeList.map((t: any) => toGrd(t.price_grd || t.price || 0)).filter((p: number) => p > 0);
            const high = prices.length > 0 ? Math.max(...prices) : spotPrice;
            const low = prices.length > 0 ? Math.min(...prices) : spotPrice;
            const firstPrice = prices.length > 0 ? prices[0] : spotPrice;
            const change = spotPrice - firstPrice;
            const changePct = firstPrice > 0 ? (change / firstPrice) * 100 : 0;
            // Volume from trades
            const vol = tradeList.reduce((sum: number, t: any) => sum + ((t.amount || 0) * toGrd(t.price_grd || 0)), 0);
            stockList.push({
              symbol: s.kode, name: s.nama, assetId: s.assetId, tipe: tipUp || "SAHAM",
              price: spotPrice, change, changePercent: changePct,
              high24h: high, low24h: low, volume: vol,
            });
          } catch {
            stockList.push({
              symbol: s.kode, name: s.nama, assetId: s.assetId, tipe: s.tipe || "SAHAM",
              price: 0, change: 0, changePercent: 0, high24h: 0, low24h: 0, volume: 0,
            });
          }
        }
        // Add GRD native coin at the top
        const grdEntry: Stock = {
          symbol: "GRD", name: "Garuda Coin", assetId: "native-grd", tipe: "NATIVE",
          price: 1, change: 0, changePercent: 0, high24h: 1, low24h: 1, volume: 0,
        };
        setStocks([grdEntry, ...stockList]);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, []);

  // Lightweight 1s refresh: only update oracle rates for stablecoins
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(apiUrl("/api/oracle/rates")).then(r => r.json()).catch(() => []);
        if (!Array.isArray(res) || res.length === 0) return;
        const oracleMap: Record<string, number> = {};
        for (const r of res) {
          if (r.symbol && r.grd_per_unit > 0) oracleMap[r.symbol.toUpperCase()] = r.grd_per_unit;
        }
        setStocks(prev => prev.map(s => {
          const tip = (s.tipe || "").toUpperCase();
          if (tip !== "STABLECOIN" && tip !== "ORACLE") return s;
          const sym = s.symbol.toUpperCase();
          const base = sym.startsWith("P") && sym.length > 1 ? sym.slice(1) : sym;
          const oraclePrice = oracleMap[sym] ?? oracleMap[base] ?? 0;
          if (oraclePrice > 0 && oraclePrice !== s.price) {
            return { ...s, price: oraclePrice };
          }
          return s;
        }));
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return { stocks, loading, blockHeight };
}

// ─── Stablecoin Swap Form (Money Changer style) ───
function StablecoinSwapForm({ symbol, assetId, wallet, onTradeExecuted }: {
  symbol: string; assetId: string;
  wallet?: { isConnected: boolean; address: string; balanceGrd: number; assets: { asset_id: string; symbol: string; balance: number }[]; connect: () => void; refreshBalance: () => void };
  onTradeExecuted?: () => void;
}) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const isConnected = wallet?.isConnected ?? false;
  const availableGrd = wallet?.balanceGrd ?? 0;
  const tokenBalance = wallet?.assets?.find(a => a.symbol === symbol)?.balance ?? 0;

  // Real-time oracle rate: 1 token = pegRate GRD, updated every 5s
  const [pegRate, setPegRate] = useState(0.001);
  useEffect(() => {
    const fetchRate = () => {
      // Try oracle first (real-time per second), fallback to static peg
      fetch(apiUrl(`/api/oracle/rates?symbol=${symbol}`)).then(r => r.json())
        .then((data: any[]) => {
          if (Array.isArray(data) && data.length > 0 && data[0].grd_per_unit > 0) {
            setPegRate(data[0].grd_per_unit);
          } else {
            // Fallback to on-chain peg
            fetch(apiUrl(`/api/blockchain/peg/${assetId}`)).then(r => r.json())
              .then(d => { if (d.peg_rate_grd > 0) setPegRate(d.peg_rate_grd); else if (d.peg_rate > 0) setPegRate(d.peg_rate); })
              .catch(() => {});
          }
        })
        .catch(() => {});
    };
    fetchRate();
    const iv = setInterval(fetchRate, 5000);
    return () => clearInterval(iv);
  }, [assetId, symbol]);
  const swapRate = pegRate > 0 ? 1 / pegRate : 1000; // 1 GRD = how many tokens
  const qty = parseFloat(amount) || 0;
  const estimatedOut = direction === "buy" ? qty * swapRate : qty / swapRate;

  const handleSwap = async () => {
    if (!isConnected) {
      toast({ title: "Wallet belum terhubung", description: "Klik Connect Wallet terlebih dahulu", variant: "destructive" });
      return;
    }
    if (qty <= 0) return;

    setIsPending(true);
    try {
      const res = await fetch(apiUrl("/api/dex/swap"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          asset_id: assetId,
          amount: direction === "buy" ? qty : Math.floor(qty),
          address: wallet!.address,
          price: 1 / swapRate,
        }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        toast({
          title: `Swap ${direction === "buy" ? "GRD → " + symbol : symbol + " → GRD"} Berhasil`,
          description: direction === "buy"
            ? `${qty} GRD → ${estimatedOut.toFixed(0)} ${symbol}`
            : `${qty} ${symbol} → ${estimatedOut.toFixed(8)} GRD`,
        });
        setAmount("");
        wallet!.refreshBalance();
        onTradeExecuted?.();
      } else {
        toast({ title: "Swap Gagal", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Gagal menghubungi server", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-white h-full flex flex-col">
      <div className="flex items-center justify-center border-b border-border py-2.5">
        <span className="text-xs font-bold text-[#8B0000]">💱 Swap Stablecoin</span>
      </div>
      <div className="p-4 flex-1 space-y-4">
        {/* Direction toggle */}
        <div className="flex gap-0">
          <button onClick={() => setDirection("buy")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-l-lg transition-all ${direction === "buy" ? "bg-emerald-500 text-white" : "bg-gray-100 text-muted-foreground"}`}>
            Beli {symbol}
          </button>
          <button onClick={() => setDirection("sell")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-r-lg transition-all ${direction === "sell" ? "bg-[#CC0001] text-white" : "bg-gray-100 text-muted-foreground"}`}>
            Jual {symbol}
          </button>
        </div>

        {/* Rate info */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Rate:</span><span className="font-bold">1 GRD = {swapRate.toLocaleString()} {symbol}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Saldo GRD:</span><span className="font-mono">{isConnected ? availableGrd.toFixed(4) : "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Saldo {symbol}:</span><span className="font-mono">{isConnected ? tokenBalance.toLocaleString() : "—"}</span></div>
        </div>

        {/* Input */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {direction === "buy" ? "Jumlah GRD" : `Jumlah ${symbol}`}
          </label>
          <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-50 border border-border rounded-lg px-3 py-3 font-mono text-sm outline-none focus:border-[#8B0000]" />
        </div>

        {/* Estimated output */}
        <div className="bg-emerald-50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Anda akan menerima:</div>
          <div className="text-lg font-bold font-mono text-emerald-700">
            {qty > 0 ? (direction === "buy" ? `${estimatedOut.toFixed(0)} ${symbol}` : `${estimatedOut.toFixed(8)} GRD`) : "—"}
          </div>
        </div>

        {/* Swap button */}
        {isConnected ? (
          <button onClick={handleSwap} disabled={isPending || qty <= 0}
            className="w-full py-3 rounded-xl font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] disabled:opacity-50 transition-colors">
            {isPending ? "Memproses..." : `Swap ${direction === "buy" ? "GRD → " + symbol : symbol + " → GRD"}`}
          </button>
        ) : (
          <button onClick={wallet?.connect} className="w-full py-3 rounded-xl font-bold text-white bg-[#8B0000] hover:bg-[#6B0000]">
            Connect Wallet
          </button>
        )}

        <div className="text-[10px] text-center text-muted-foreground">
          Stablecoin swap menggunakan CBDC Reserve Pool dengan rate tetap
        </div>
      </div>
    </div>
  );
}

// ─── My Orders Panel (below chart) ───
interface MyOrder {
  order_id: string;
  asset_id: string;
  symbol?: string;
  side: "buy" | "sell";
  price_grd: number;
  quantity: number;
  remaining: number;
  status: string;
  timestamp?: number;
}

function MyOrdersPanel({ wallet, tradeRefresh, onCancelOrder, onConnectWallet }: {
  wallet: { isConnected: boolean; address: string; connect: () => void };
  tradeRefresh: number;
  onCancelOrder: () => void;
  onConnectWallet?: () => void;
}) {
  const [bottomTab, setBottomTab] = useState<"orders" | "history">("orders");
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const toGrd = (p: number) => p > 1000 ? p / 1e8 : p;

  useEffect(() => {
    if (!wallet.isConnected || !wallet.address) {
      setOrders([]);
      return;
    }
    const fetchOrders = () => {
      fetch(apiUrl(`/api/dex/my-orders/${wallet.address}?status=open`))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setOrders(data);
          else setOrders([]);
        })
        .catch(() => setOrders([]));
    };
    fetchOrders();
    const iv = setInterval(fetchOrders, 5000);
    return () => clearInterval(iv);
  }, [wallet.isConnected, wallet.address, tradeRefresh]);

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId);
    try {
      const res = await fetch(apiUrl("/api/dex/order/cancel"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, address: wallet.address }),
      }).then(r => r.json());
      if (res.status === "ok") {
        setOrders(prev => prev.filter(o => o.order_id !== orderId));
        onCancelOrder();
      }
    } catch { /* ignore */ }
    setCancelling(null);
  };

  return (
    <div className="bg-gray-50/50 border-t border-border">
      <div className="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground">
        {([["orders", "Order Terbuka"], ["history", "Riwayat Trade"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setBottomTab(key as "orders" | "history")}
            className={`font-semibold hover:text-foreground transition-colors pb-1 ${
              bottomTab === key ? "text-foreground border-b-2 border-[#8B0000]" : ""
            }`}
          >
            {label} {key === "orders" && orders.length > 0 && <span className="ml-1 text-[10px] bg-[#8B0000] text-white px-1.5 rounded-full">{orders.length}</span>}
          </button>
        ))}
      </div>

      {bottomTab === "orders" ? (
        <div className="px-2 pb-2 max-h-[140px] overflow-y-auto">
          {!wallet.isConnected ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              <button className="underline hover:text-foreground text-[#8B0000] transition-colors" onClick={onConnectWallet || wallet.connect}>
                Connect Wallet
              </button>{" "}untuk melihat order terbuka.
            </div>
          ) : orders.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Tidak ada order terbuka. Wallet: <span className="font-mono text-[#8B0000]">{wallet.address.slice(0, 12)}...</span>
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-semibold px-2 py-1">Side</th>
                  <th className="text-left font-semibold px-2 py-1">Asset</th>
                  <th className="text-right font-semibold px-2 py-1">Price (GRD)</th>
                  <th className="text-right font-semibold px-2 py-1">Qty</th>
                  <th className="text-right font-semibold px-2 py-1">Remaining</th>
                  <th className="text-center font-semibold px-2 py-1">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id} className="hover:bg-white transition-colors">
                    <td className={`px-2 py-1 font-bold ${o.side === "buy" ? "text-green-600" : "text-red-600"}`}>
                      {o.side === "buy" ? "BUY" : "SELL"}
                    </td>
                    <td className="px-2 py-1 font-mono">{o.symbol || o.asset_id?.slice(0, 8)}</td>
                    <td className="px-2 py-1 text-right font-mono">{toGrd(o.price_grd).toFixed(6)}</td>
                    <td className="px-2 py-1 text-right font-mono">{o.quantity}</td>
                    <td className="px-2 py-1 text-right font-mono">{o.remaining}</td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => handleCancel(o.order_id)}
                        disabled={cancelling === o.order_id}
                        className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 font-semibold transition-colors"
                      >
                        {cancelling === o.order_id ? "..." : "Cancel"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="px-2 pb-2 py-3 text-xs text-muted-foreground text-center">
          Riwayat trade ditampilkan di panel kanan (Trades tab).
        </div>
      )}
    </div>
  );
}

// ─── Trade Page ───
function TradePage({ onSwitchToSwap, onSwitchToEIPO, onSwitchToPortfolio }: { onSwitchToSwap: () => void; onSwitchToEIPO: () => void; onSwitchToPortfolio: () => void }) {
  const { stocks: STOCKS, loading: stocksLoading, blockHeight } = useOnChainStocks();
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [rightTab, setRightTab] = useState<"orderbook" | "trades">("orderbook");
  const [showMarketPanel, setShowMarketPanel] = useState(false);
  const [marketFilter, setMarketFilter] = useState("All");
  const [marketSearch, setMarketSearch] = useState("");
  const [tradeRefresh, setTradeRefresh] = useState(0);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const wallet = useDexWallet();

  // Auto-select GRDN (saham) first since it has orderbook, fallback to first
  useEffect(() => {
    if (STOCKS.length > 0 && !selectedSymbol) {
      const grdn = STOCKS.find(s => s.symbol === "GRDN");
      setSelectedSymbol(grdn ? grdn.symbol : STOCKS[0].symbol);
    }
  }, [STOCKS, selectedSymbol]);

  const stock = STOCKS.find(s => s.symbol === selectedSymbol) ?? STOCKS[0] ?? { symbol: "—", name: "Loading...", assetId: "", tipe: "SAHAM", price: 0, change: 0, changePercent: 0, high24h: 0, low24h: 0, volume: 0 };
  const isStablecoin = stock.tipe === "STABLECOIN" || stock.tipe === "ORACLE";
  const isPositive = stock.changePercent >= 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-3 h-14 shrink-0 bg-white border-b border-gray-200 shadow-sm">
        {/* Left: Logo + Pair selector + Price info */}
        <div className="flex items-center gap-3 shrink-0">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/logo-garuda.png" alt="GarudaChain" className="w-7 h-7" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-bold text-sm text-foreground hidden sm:block">
              Garuda<span className="text-[#8B0000]">DEX</span>
            </span>
          </a>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Pair selector with price info */}
          <button
            onClick={() => setShowMarketPanel(true)}
            className="flex items-center gap-2.5 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all group"
          >
            <AssetLogo symbol={selectedSymbol} size={28} tipe={isStablecoin ? "STABLECOIN" : selectedSymbol === "GRD" ? "NATIVE" : "SAHAM"} />
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[15px] text-foreground">{selectedSymbol}<span className="text-gray-400">/GRD</span></span>
                <ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isStablecoin ? "bg-blue-50 text-blue-600" : "bg-red-50 text-[#8B0000]"}`}>
                {isStablecoin ? "Swap" : "Spot"}
              </span>
            </div>
          </button>

          {/* Live price display */}
          <div className="hidden md:flex items-center gap-6 ml-3 text-[12px]">
            <div>
              <span className={`text-lg font-bold font-mono ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                {stock.price < 1 ? stock.price.toFixed(6) : fmtNum(stock.price, 4)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400 text-[10px]">24h Change</span>
              <span className={`font-mono font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400 text-[10px]">24h High</span>
              <span className="font-mono text-foreground">{stock.high24h < 1 ? stock.high24h.toFixed(6) : fmtNum(stock.high24h, 4)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400 text-[10px]">24h Low</span>
              <span className="font-mono text-foreground">{stock.low24h < 1 ? stock.low24h.toFixed(6) : fmtNum(stock.low24h, 4)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400 text-[10px]">24h Volume</span>
              <span className="font-mono text-foreground">
                {stock.volume >= 1e6 ? `${(stock.volume / 1e6).toFixed(2)}M` : stock.volume >= 1e3 ? `${(stock.volume / 1e3).toFixed(1)}K` : fmtNum(stock.volume, 2)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Nav + Block + Wallet */}
        <div className="shrink-0 flex items-center gap-2">
          {/* Trade / Swap nav */}
          <nav className="hidden lg:flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-lg mr-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-[#8B0000] shadow-sm">
              <BarChart3 className="w-3.5 h-3.5" />
              Trade
            </button>
            <button onClick={onSwitchToSwap} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Swap
            </button>
            <button onClick={onSwitchToEIPO} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <FileText className="w-3.5 h-3.5" />
              e-IPO
            </button>
            <button onClick={onSwitchToPortfolio} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <Wallet className="w-3.5 h-3.5" />
              Portfolio
            </button>
          </nav>

          {/* Explorer link */}
          <a
            href="http://localhost:5174"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors border border-border/50"
          >
            <Globe className="w-3.5 h-3.5" />
            Explorer
          </a>

          {/* Block badge */}
          <span className="text-[10px] font-mono font-semibold text-[#8B0000] bg-red-50 px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-red-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Block #{blockHeight.toLocaleString("id-ID")}
          </span>

          {/* Wallet �� Hyperliquid-style */}
          {wallet.isConnected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDepositModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Deposit
              </button>
              <AccountDropdown
                wallet={wallet}
                onDeposit={() => setShowDepositModal(true)}
                onWithdraw={() => setShowWithdrawModal(true)}
                onDisconnect={wallet.disconnect}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-colors"
            >
              <Wallet className="w-3.5 h-3.5" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Market Selection Panel */}
      {showMarketPanel && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowMarketPanel(false)} />

          {/* Panel */}
          <div className="relative bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-foreground">Spot</span>
              </div>
              <button onClick={() => setShowMarketPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category filters */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0">
              {[
                { key: "All", label: "All" },
                { key: "Blockchain", label: "Blockchain" },
                { key: "Saham", label: "Saham" },
                { key: "Orderbook", label: "Stablecoin Orderbook" },
                { key: "Oracle", label: "Stablecoin Oracle" },
              ].map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setMarketFilter(cat.key)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                    marketFilter === cat.key ? "text-[#8B0000] bg-red-50 border border-[#8B0000]/20" : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              {/* Search */}
              <div className="ml-auto flex items-center gap-2 bg-gray-50 border border-border rounded-md px-2 py-1">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  placeholder="Search..."
                  className="bg-transparent text-xs outline-none w-28 placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-4 px-4 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border shrink-0">
              <div>Market</div>
              <div className="text-right">Last Price</div>
              <div className="text-right">24h</div>
              <div className="text-right">Volume ▾</div>
            </div>

            {/* Market list */}
            <div className="flex-1 overflow-y-auto">
              {STOCKS
                .filter((s) => {
                  if (marketSearch) {
                    return s.symbol.toLowerCase().includes(marketSearch.toLowerCase()) ||
                           s.name.toLowerCase().includes(marketSearch.toLowerCase());
                  }
                  if (marketFilter === "All") return true;
                  if (marketFilter === "Blockchain") return s.tipe === "NATIVE";
                  if (marketFilter === "Saham") return s.tipe === "SAHAM";
                  if (marketFilter === "Orderbook") return s.tipe === "STABLECOIN";
                  if (marketFilter === "Oracle") return s.tipe === "ORACLE";
                  return true;
                })
                .sort((a, b) => {
                  // Sort order: Native, Saham, Orderbook Stablecoin, Oracle
                  const order: Record<string, number> = { "NATIVE": 0, "SAHAM": 1, "STABLECOIN": 2, "ORACLE": 3 };
                  const oa = order[a.tipe] ?? 4;
                  const ob = order[b.tipe] ?? 4;
                  if (oa !== ob) return oa - ob;
                  return a.symbol.localeCompare(b.symbol);
                })
                .map((s) => {
                  const isPos = s.changePercent >= 0;
                  return (
                    <button
                      key={s.assetId || s.symbol}
                      onClick={() => { setSelectedSymbol(s.symbol); setShowMarketPanel(false); setMarketSearch(""); }}
                      className={`w-full grid grid-cols-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-border/50 ${
                        selectedSymbol === s.symbol ? "bg-red-50/50" : ""
                      }`}
                    >
                      {/* Market */}
                      <div className="flex items-center gap-2">
                        <AssetLogo symbol={s.symbol} size={28} tipe={s.tipe} />
                        <div>
                          <span className="text-sm font-bold text-foreground">{s.symbol}/GRD</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${
                              s.tipe === "NATIVE" ? "bg-amber-50 text-amber-700" :
                              s.tipe === "SAHAM" ? "bg-purple-50 text-purple-700" :
                              s.tipe === "ORACLE" ? "bg-blue-50 text-blue-700" :
                              s.tipe === "STABLECOIN" ? "bg-emerald-50 text-emerald-700" :
                              "bg-gray-50 text-gray-600"
                            }`}>
                              {s.tipe === "NATIVE" ? "Blockchain" : s.tipe === "SAHAM" ? "Saham" : s.tipe === "ORACLE" ? "Oracle" : s.tipe === "STABLECOIN" ? "Orderbook" : s.tipe}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Last Price */}
                      <div className="text-right font-mono text-sm text-foreground">
                        {fmtNum(s.price > 100 ? s.price / 10000 : s.price, 4)}
                      </div>

                      {/* 24h Change */}
                      <div className="text-right font-mono text-sm font-semibold" style={{ color: isPos ? "#16c784" : "#ea3943" }}>
                        {isPos ? "+" : ""}{s.changePercent.toFixed(2)}%
                      </div>

                      {/* Volume */}
                      <div className="text-right font-mono text-sm text-foreground">
                        {s.volume >= 1e6 ? `$${(s.volume / 1e6).toFixed(2)}M` : `$${(s.volume / 1e3).toFixed(2)}K`}
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* Bottom bar */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[11px] text-muted-foreground shrink-0 bg-gray-50">
              <span>Open <kbd className="bg-gray-200 px-1 rounded text-[10px]">⌘K</kbd></span>
              <span>Navigate <kbd className="bg-gray-200 px-1 rounded text-[10px]">↑</kbd> <kbd className="bg-gray-200 px-1 rounded text-[10px]">↓</kbd></span>
              <span>Select Market <kbd className="bg-gray-200 px-1 rounded text-[10px]">Enter</kbd></span>
              <span>Search <kbd className="bg-gray-200 px-1 rounded text-[10px]">S</kbd></span>
              <span>Close <kbd className="bg-gray-200 px-1 rounded text-[10px]">Esc</kbd></span>
            </div>
          </div>
        </div>
      )}

      {/* Main trading area — Chart LEFT | OrderBook CENTER | OrderForm RIGHT */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: Chart (largest area) */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <PriceChart symbol={selectedSymbol} assetId={stock.assetId} stock={stock} />
          </div>

          {/* Bottom: Open Orders / Riwayat Trade */}
          <MyOrdersPanel wallet={wallet} tradeRefresh={tradeRefresh} onCancelOrder={() => setTradeRefresh(n => n + 1)} onConnectWallet={() => setShowWalletModal(true)} />
        </div>

        {/* CENTER: Order Book / Trades */}
        <div className="flex flex-col shrink-0 bg-white border-l border-border" style={{ width: "280px" }}>
          {/* Tabs: Order Book | Trades (Saham) or Swap Info (Stablecoin) */}
          <div className="flex items-center border-b border-border shrink-0">
            {(["orderbook", "trades"] as const).map((tab) => {
              const label = tab === "orderbook" ? "Order Book" : "Trades";
              const active = rightTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-bold transition-all ${
                    active ? "text-foreground border-b-2 border-[#8B0000]" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Order Book or Trades panel */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightTab === "orderbook" ? (
              <OrderbookCard symbol={selectedSymbol} basePrice={stock.price} assetId={stock.assetId} refreshKey={tradeRefresh} />
            ) : (
              <TradeHistoryCard symbol={selectedSymbol} basePrice={stock.price} assetId={stock.assetId} refreshKey={tradeRefresh} />
            )}
          </div>
        </div>

        {/* RIGHT: Order Form (Saham=Orderbook) or Swap Form (Stablecoin=Swap) */}
        <div className="shrink-0 bg-white border-l border-border" style={{ width: "300px" }}>
          {isStablecoin ? (
            <StablecoinSwapForm symbol={stock.symbol} assetId={stock.assetId} wallet={wallet} onTradeExecuted={() => setTradeRefresh(n => n + 1)} />
          ) : (
            <OrderForm symbol={selectedSymbol} basePrice={stock.price} assetId={stock.assetId} latestBlock={blockHeight} wallet={wallet} onTradeExecuted={() => setTradeRefresh(n => n + 1)} />
          )}
        </div>
      </div>

      {/* Modals */}
      <ConnectWalletModal open={showWalletModal} onClose={() => setShowWalletModal(false)} wallet={wallet} />
      <DepositWithdrawModal open={showDepositModal} onClose={() => setShowDepositModal(false)} wallet={wallet} defaultTab="deposit" />
      <DepositWithdrawModal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} wallet={wallet} defaultTab="withdraw" />
    </div>
  );
}

// ─── Portfolio Panel ───
function PortfolioPanel({ wallet, onConnectWallet, onDeposit, onWithdraw }: { wallet: ReturnType<typeof useDexWallet>; onConnectWallet?: () => void; onDeposit?: () => void; onWithdraw?: () => void }) {
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(apiUrl("/api/blockchain/stocks"))
      .then(r => r.json())
      .then((stocks: any[]) => {
        const map: Record<string, number> = {};
        for (const s of stocks) if (s.kode && s.lastPrice) map[s.kode] = s.lastPrice;
        setPrices(map);
      })
      .catch(() => {});
  }, []);

  if (!wallet.isConnected) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden bg-white">
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-bold mb-1">Portofolio</h3>
          <p className="text-[10px] text-muted-foreground">Kepemilikan token di wallet Anda</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#8B0000]/10 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-[#8B0000]" />
          </div>
          <div>
            <p className="font-semibold text-sm mb-1">Wallet Belum Terhubung</p>
            <p className="text-xs text-muted-foreground">Hubungkan wallet untuk melihat portofolio</p>
          </div>
          <button
            onClick={onConnectWallet || wallet.connect}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-colors shadow-lg shadow-[#8B0000]/20"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  const holdAssets = wallet.assets.filter(a => a.balance > 0);
  const totalGrdValue = wallet.balanceGrd + holdAssets.reduce((sum, a) => sum + (prices[a.symbol] || 0) * a.balance, 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white">
      {/* Header — Hyperliquid-style account overview */}
      <div className="p-4 border-b border-border shrink-0">
        <h3 className="text-lg font-bold mb-3">Portofolio</h3>

        {/* Trading Account Balance Card */}
        <div className="bg-gradient-to-br from-[#8B0000] to-[#5a0000] rounded-xl p-3.5 text-white mb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] opacity-70 uppercase tracking-wider flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Trading Account
            </div>
          </div>
          <div className="text-xl font-bold font-mono">{wallet.balanceGrd.toLocaleString("id-ID", { minimumFractionDigits: 4 })} GRD</div>
          <div className="text-[10px] font-mono opacity-60 mt-0.5">{wallet.address}</div>
        </div>

        {/* L1 Wallet Balance */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-border mb-3">
          <div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              L1 Wallet
            </div>
            <div className="text-xs font-bold font-mono mt-0.5">{wallet.l1BalanceGrd.toFixed(4)} GRD</div>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">{wallet.l1Address.slice(0, 10)}...</div>
        </div>

        {/* Deposit / Withdraw buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onDeposit}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Deposit
          </button>
          <button
            onClick={onWithdraw}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-[#8B0000] border border-[#8B0000]/30 hover:bg-red-50 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Withdraw
          </button>
        </div>
      </div>

      {/* Holdings */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 flex items-center justify-between border-b border-border/50">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Token Holdings</span>
          <span className="text-[10px] text-muted-foreground">{holdAssets.length} token</span>
        </div>
        {holdAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center h-48">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Belum ada token</p>
            <p className="text-xs text-muted-foreground/70">Beli saham melalui e-IPO atau DEX</p>
          </div>
        ) : (
          <div className="p-3 flex flex-col gap-2">
            {holdAssets.map(asset => {
              const priceGrd = prices[asset.symbol] || 0;
              const assetTotalGrd = priceGrd * asset.balance;
              return (
                <div key={asset.asset_id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-[#8B0000]/30 hover:bg-red-50/30 transition-all">
                  <AssetLogo symbol={asset.symbol} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{asset.symbol}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{asset.asset_id.slice(0, 16)}...</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-sm font-mono">{asset.balance.toLocaleString("id-ID")}</div>
                    {assetTotalGrd > 0 && (
                      <div className="text-[11px] text-muted-foreground">= {assetTotalGrd.toLocaleString("id-ID", { maximumFractionDigits: 2 })} GRD</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={wallet.refreshBalance}
          className="w-full py-2 rounded-xl text-xs font-semibold text-[#8B0000] border border-[#8B0000]/30 hover:bg-red-50 transition-colors"
        >
          Refresh Saldo
        </button>
      </div>
    </div>
  );
}

// ─── e-IPO Data & Panel (On-Chain) ───
interface OnChainPresale {
  asset_id: string;
  symbol: string;
  name: string;
  tipe?: string;
  price_per_token: number;
  price_grd: number;
  tokens_for_sale: number;
  tokens_sold: number;
  total_supply: number;
  sold: number;
  pct_sold: number;
  grd_raised: number;
  end_timestamp: number;
  start_block: number;
  end_block: number;
  status: string;
  num_buyers?: number;
  buyers?: { address: string; amount: number; tokens?: number; grd_paid?: number }[];
}

function PresaleDetail({ presale }: { presale: OnChainPresale }) {
  const totalSupply = presale.tokens_for_sale || presale.total_supply || 0;
  const sold = presale.tokens_sold || presale.sold || 0;
  const progress = presale.pct_sold || (totalSupply > 0 ? (sold / totalSupply) * 100 : 0);

  const [meta, setMeta] = useState<{
    sector?: string; website?: string;
    social_x?: string; social_li?: string; social_yt?: string; social_tt?: string;
    doc1_url?: string; doc1_name?: string; doc2_url?: string; doc2_name?: string;
  } | null>(null);

  useEffect(() => {
    fetch(apiUrl(`/api/asset/metadata/${presale.symbol}`))
      .then(r => r.json()).then(setMeta).catch(() => {});
  }, [presale.symbol]);
  const remaining = totalSupply - sold;
  const price = presale.price_grd || presale.price_per_token || 0;

  return (
    <motion.div
      key={presale.asset_id}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-full overflow-y-auto bg-white"
    >
      {/* Header */}
      <div className="p-5 border-b border-border">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3"
        >
          <AssetLogo symbol={presale.symbol} size={48} tipe={presale.tipe} />
          <div className="flex-1">
            <h3 className="text-xl font-bold">{presale.symbol}</h3>
            <p className="text-sm text-muted-foreground">{presale.name || "Token Saham"}</p>
            {meta && (meta.sector || meta.website || meta.social_x || meta.social_li || meta.social_yt || meta.social_tt || meta.doc1_url || meta.doc2_url) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {meta.sector && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 font-medium">{meta.sector}</span>
                )}
                {meta.website && (
                  <a href={meta.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                    <Globe className="w-2.5 h-2.5" /> Website
                  </a>
                )}
                {meta.social_x && <a href={meta.social_x} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">X</a>}
                {meta.social_li && <a href={meta.social_li} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">LinkedIn</a>}
                {meta.social_yt && <a href={meta.social_yt} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">YouTube</a>}
                {meta.social_tt && <a href={meta.social_tt} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">TikTok</a>}
                {meta.doc1_url && (
                  <a href={meta.doc1_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                    <FileText className="w-2.5 h-2.5" />{meta.doc1_name || "Prospektus"}
                  </a>
                )}
                {meta.doc2_url && (
                  <a href={meta.doc2_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                    <FileText className="w-2.5 h-2.5" />{meta.doc2_name || "Legalitas"}
                  </a>
                )}
              </div>
            )}
          </div>
          <span className={`ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full ${
            presale.status === "OPEN" ? "bg-emerald-100 text-emerald-700" :
            presale.status === "CLOSED" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-600"
          }`}>{presale.status}</span>
        </motion.div>
      </div>

      {/* Presale Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mx-5 mt-4 p-4 rounded-xl bg-red-50 border border-red-200/50"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Presale Progress</span>
          <span className="text-xs font-bold text-[#8B0000]">{progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
          <div className="bg-[#8B0000] h-2.5 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Terjual</span>
            <div className="font-bold font-mono">{fmtNum(sold)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Sisa</span>
            <div className="font-bold font-mono">{fmtNum(remaining)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">GRD Raised</span>
            <div className="font-bold font-mono text-[#8B0000]">{(presale.grd_raised || 0).toFixed(2)}</div>
          </div>
        </div>
      </motion.div>

      {/* Details */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="px-5 py-4 space-y-0"
      >
        {[
          { label: "Harga per Token", value: `${price.toFixed(6)} GRD` },
          { label: "Total Dijual", value: fmtNum(totalSupply) },
          { label: "Total Terjual", value: fmtNum(sold) },
          ...(presale.end_timestamp ? [{ label: "Berakhir", value: new Date(presale.end_timestamp * 1000).toLocaleString("id-ID") }] : []),
          ...(presale.num_buyers ? [{ label: "Jumlah Pembeli", value: String(presale.num_buyers) }] : []),
          { label: "Status", value: presale.status },
          { label: "Asset ID", value: presale.asset_id.slice(0, 16) + "..." },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-4 text-sm py-2.5 border-b border-border/30">
            <span className="font-semibold text-foreground shrink-0">{label}</span>
            <span className="text-muted-foreground text-right font-mono">{value}</span>
          </div>
        ))}
      </motion.div>

      {/* Buyers */}
      {presale.buyers && presale.buyers.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="px-5 pb-4"
        >
          <div className="text-sm font-semibold mb-2">Pembeli ({presale.buyers.length})</div>
          <div className="space-y-1.5">
            {presale.buyers.map((b, i) => (
              <div key={i} className="flex justify-between text-xs text-muted-foreground py-1 border-b border-border/20">
                <span className="font-mono">{b.address.slice(0, 12)}...{b.address.slice(-6)}</span>
                <span className="font-bold">{fmtNum(b.tokens || b.amount)} token</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* On-Chain Badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="px-5 pb-6"
      >
        <a href={`http://localhost:5174/saham/${presale.symbol}`} target="_blank" rel="noopener noreferrer" className="block w-full py-3 rounded-xl text-center text-xs font-semibold text-[#8B0000] bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
          Lihat Detail Saham {presale.symbol} →
        </a>
      </motion.div>
    </motion.div>
  );
}

function EIPOPanel() {
  const [presales, setPresales] = useState<OnChainPresale[]>([]);
  const [listedStocks, setListedStocks] = useState<{ symbol: string; name: string; assetId: string; price: number }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [ipoTab, setIpoTab] = useState<"Ongoing" | "Listed">("Ongoing");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPresales() {
      try {
        const [presaleRes, stocksRes] = await Promise.all([
          fetch(apiUrl("/api/blockchain/presales")).then(r => r.json()).catch(() => []),
          fetch(apiUrl("/api/blockchain/stocks")).then(r => r.json()).catch(() => []),
        ]);
        // Normalize presale data from API
        const normalized: OnChainPresale[] = (Array.isArray(presaleRes) ? presaleRes : []).map((p: any) => ({
          asset_id: p.asset_id || "",
          symbol: p.symbol || "",
          name: p.name || p.symbol || "",
          price_per_token: p.price_grd || p.price_per_unit_grd || 0,
          price_grd: p.price_grd || p.price_per_unit_grd || 0,
          tokens_for_sale: p.tokens_for_sale || 0,
          tokens_sold: p.tokens_sold || 0,
          total_supply: p.tokens_for_sale || 0,
          sold: p.tokens_sold || 0,
          pct_sold: p.pct_sold || 0,
          grd_raised: p.grd_raised || 0,
          end_timestamp: p.end_timestamp || 0,
          start_block: p.start_block || 0,
          end_block: p.end_block || 0,
          status: p.status || "OPEN",
          num_buyers: p.num_buyers || 0,
          buyers: p.buyers || [],
        }));
        setPresales(normalized);
        // Listed stocks from stocks endpoint — filter out stablecoins (pegged, kode starts with "p")
        const listed = stocksRes
          .filter((s: any) => !s.kode?.startsWith("p"))
          .map((s: any) => ({
            symbol: s.kode, name: s.nama, assetId: s.assetId, price: 0,
          }));
        setListedStocks(listed);
        if (normalized.length > 0 && !selectedId) setSelectedId(normalized[0].asset_id);
        else if (normalized.length === 0 && listed.length > 0 && !selectedId) {
          setSelectedId(listed[0].assetId);
          setIpoTab("Listed");
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    fetchPresales();
    const iv = setInterval(fetchPresales, 15000);
    return () => clearInterval(iv);
  }, []);

  const selectedPresale = presales.find(p => p.asset_id === selectedId);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* LEFT: Presale List */}
      <div className="w-[280px] shrink-0 border-r border-border flex flex-col bg-white overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-bold mb-1">e-IPO</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Presale Token Saham On-Chain</p>
          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-3 text-center border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Presale</div>
            <div className="text-2xl font-bold font-mono mt-1">{presales.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-4 py-0 border-b border-border text-sm relative">
          {(["Ongoing", "Listed"] as const).map(t => (
            <button
              key={t}
              onClick={() => setIpoTab(t)}
              className={`relative py-2.5 px-3 font-semibold transition-colors duration-200 ${
                ipoTab === t
                  ? "text-emerald-600"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "Ongoing" ? `Presale (${presales.length})` : `Listed (${listedStocks.length})`}
              {ipoTab === t && (
                <motion.div
                  layoutId="ipoTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading on-chain data...</div>
          ) : ipoTab === "Ongoing" ? (
            presales.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <p className="font-semibold mb-1">Tidak ada presale aktif</p>
                <p>Presale akan muncul ketika dibuat di on-chain</p>
              </div>
            ) : (
              presales.map((item, idx) => {
                const isActive = selectedId === item.asset_id;
                const progress = item.pct_sold || 0;
                return (
                  <motion.button
                    key={item.asset_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedId(item.asset_id)}
                    className={`w-full text-left p-3 border-b border-border/30 transition-all duration-200 ${
                      isActive
                        ? "bg-emerald-50/60 border-l-[3px] border-l-emerald-500"
                        : "hover:bg-gray-50/80 border-l-[3px] border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AssetLogo symbol={item.symbol} size={40} tipe={item.tipe} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold text-sm ${isActive ? "text-emerald-700" : ""}`}>{item.symbol}</span>
                          <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}>{item.status}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{item.name}</div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] font-mono text-[#8B0000]">{item.price_grd.toFixed(6)} GRD</span>
                          <span className="text-[10px] text-muted-foreground">{progress.toFixed(0)}% sold</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )
          ) : (
            listedStocks.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <p className="font-semibold mb-1">Belum ada saham terlisting</p>
              </div>
            ) : (
              listedStocks.map((item, idx) => {
                const isActive = selectedId === item.assetId;
                return (
                  <motion.button
                    key={item.assetId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedId(item.assetId)}
                    className={`w-full text-left p-3 border-b border-border/30 transition-all duration-200 ${
                      isActive
                        ? "bg-emerald-50/60 border-l-[3px] border-l-emerald-500"
                        : "hover:bg-gray-50/80 border-l-[3px] border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AssetLogo symbol={item.symbol} size={40} tipe="STABLECOIN" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold text-sm ${isActive ? "text-emerald-700" : ""}`}>{item.symbol}</span>
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Listed</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{item.name}</div>
                        <div className="mt-1">
                          <span className="text-[10px] font-mono text-emerald-600">{item.price > 0 ? item.price.toFixed(6) + " GRD" : "No pool"}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )
          )}
        </div>
      </div>

      {/* RIGHT: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedPresale ? (
            <PresaleDetail presale={selectedPresale} key={selectedPresale.asset_id} />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center text-center text-muted-foreground"
            >
              <div>
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-sm">
                  {presales.length === 0 ? "Belum ada presale on-chain" : "Pilih presale untuk melihat detail"}
                </p>
                <p className="text-xs mt-1">Data diambil langsung dari GarudaChain blockchain</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Swap Page ───
const BASE_TOKENS = [
  { symbol: "GRD", name: "GarudaCoin", type: "Native" },
];

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0];

const swapSchema = z.object({
  amount: z.coerce.number().positive({ message: "Amount harus lebih dari 0" }),
});

function SwapPage({ onSwitchToTrade, showEIPODefault = false, showPortfolioDefault = false, onChainStocks = [] }: { onSwitchToTrade: () => void; showEIPODefault?: boolean; showPortfolioDefault?: boolean; onChainStocks?: Stock[] }) {
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [fromToken, setFromToken] = useState("GRD");
  // Default to first stablecoin if available
  const firstStablecoin = onChainStocks.find(s => s.tipe === "STABLECOIN");
  const [toToken, setToToken] = useState(firstStablecoin?.symbol || "GRD");
  const [isHoveringSwap, setIsHoveringSwap] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState("");
  const [tokenPicker, setTokenPicker] = useState<"from" | "to" | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");
  const [rightPanel, setRightPanel] = useState<"none" | "eipo" | "portfolio">(
    showPortfolioDefault ? "portfolio" : showEIPODefault ? "eipo" : "none"
  );
  const settingsRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const wallet = useDexWallet();

  // Build TOKENS list: semua aset dari blockchain, deduplikasi by symbol
  const baseSymbols = new Set(BASE_TOKENS.map(t => t.symbol));
  const TOKENS = [
    ...BASE_TOKENS,
    ...onChainStocks
      .filter(s => !baseSymbols.has(s.symbol))
      .map(s => ({
        symbol: s.symbol,
        name: s.name,
        type: s.tipe === "STABLECOIN" ? "Stablecoin" : s.tipe === "NATIVE" ? "Native" : "Saham",
      })),
  ];

  const { register, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(swapSchema),
    defaultValues: { amount: 0 },
  });

  const amount = watch("amount") || 0;

  // Compute exchange rate from stablecoin peg rates
  const getRate = (from: string, to: string) => {
    const fromStock = onChainStocks.find(s => s.symbol === from);
    const toStock = onChainStocks.find(s => s.symbol === to);
    // Stablecoins use their on-chain peg rate (e.g. 1 IDR = 0.001 GRD)
    const getPrice = (sym: string, stock?: Stock) => {
      if (sym === "GRD") return 1;
      if (stock?.tipe === "STABLECOIN") return stock.price > 0 ? stock.price : 0.001;
      return stock?.price || 0;
    };
    const fromPriceGrd = getPrice(from, fromStock);
    const toPriceGrd = getPrice(to, toStock);
    if (toPriceGrd === 0) return 0;
    return fromPriceGrd / toPriceGrd;
  };
  const exchangeRate = getRate(fromToken, toToken);
  const toAmount = amount * exchangeRate;
  const fee = amount * 0.0005;

  // Get balance for selected from-token
  const getTokenBalance = (symbol: string) => {
    if (!wallet.isConnected) return null;
    if (symbol === "GRD") return wallet.balanceGrd;
    const asset = wallet.assets.find(a => a.symbol === symbol);
    return asset ? asset.balance : 0;
  };
  const fromBalance = getTokenBalance(fromToken);
  const toBalance = getTokenBalance(toToken);

  const handleSwapTokens = () => {
    const prevFrom = fromToken;
    const prevTo = toToken;
    const prevAmount = amount;
    const prevRate = getRate(prevFrom, prevTo);
    const computedTo = prevAmount * prevRate;
    setFromToken(prevTo);
    setToToken(prevFrom);
    setValue("amount", computedTo || 0);
  };

  const handleExecute = async () => {
    if (!wallet.isConnected) {
      toast({ title: "Wallet belum terhubung", description: "Klik Connect Wallet terlebih dahulu" });
      return;
    }

    const fromIsGrd = fromToken === "GRD";
    const toIsGrd = toToken === "GRD";
    const slippageMult = slippage / 100;

    const doSwap = async (direction: "buy" | "sell", assetId: string, swapAmount: number, price: number) => {
      const res = await fetch(apiUrl("/api/dex/swap"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, asset_id: assetId, amount: swapAmount, address: wallet.address, price }),
      }).then(r => r.json());
      return res;
    };

    try {
      // Case 1: GRD → Token
      if (fromIsGrd) {
        const stock = onChainStocks.find(s => s.symbol === toToken);
        if (!stock) { toast({ title: "Token tidak ditemukan" }); return; }
        const res = await doSwap("buy", stock.assetId, amount, stock.price * (1 + slippageMult));
        if (res.error) { toast({ title: "Swap Gagal", description: res.error }); return; }
        const matched = res.trades_matched || 0;
        toast({ title: matched > 0 ? "Swap Berhasil!" : "Order Pending", description: matched > 0 ? `${fmtNum(toAmount, 4)} ${toToken} diterima` : `Order menunggu di orderbook` });
      }
      // Case 2: Token → GRD
      else if (toIsGrd) {
        const stock = onChainStocks.find(s => s.symbol === fromToken);
        if (!stock) { toast({ title: "Token tidak ditemukan" }); return; }
        const res = await doSwap("sell", stock.assetId, Math.floor(amount), stock.price * (1 - slippageMult));
        if (res.error) { toast({ title: "Swap Gagal", description: res.error }); return; }
        const matched = res.trades_matched || 0;
        toast({ title: matched > 0 ? "Swap Berhasil!" : "Order Pending", description: matched > 0 ? `${fmtNum(toAmount, 4)} GRD diterima` : `Order menunggu di orderbook` });
      }
      // Case 3: Token → Token (routing via GRD)
      else {
        const fromStock = onChainStocks.find(s => s.symbol === fromToken);
        const toStock = onChainStocks.find(s => s.symbol === toToken);
        if (!fromStock || !toStock) { toast({ title: "Token tidak ditemukan" }); return; }
        // Step 1: jual fromToken → GRD
        const res1 = await doSwap("sell", fromStock.assetId, Math.floor(amount), fromStock.price * (1 - slippageMult));
        if (res1.error) { toast({ title: `Swap Gagal (jual ${fromToken})`, description: res1.error }); return; }
        // Step 2: beli toToken dengan GRD
        const grdAmount = amount * fromStock.price;
        const res2 = await doSwap("buy", toStock.assetId, grdAmount, toStock.price * (1 + slippageMult));
        if (res2.error) { toast({ title: `Swap Gagal (beli ${toToken})`, description: res2.error }); return; }
        const matched2 = res2.trades_matched || 0;
        toast({ title: matched2 > 0 ? "Swap Berhasil! (via GRD)" : "Order Pending", description: matched2 > 0 ? `${fmtNum(amount, 4)} ${fromToken} → ${fmtNum(toAmount, 4)} ${toToken}` : `Order routing via GRD menunggu match` });
      }

      setValue("amount", 0);
      wallet.refreshBalance();
    } catch {
      toast({ title: "Swap Gagal", description: "Tidak bisa terhubung ke node" });
    }
  };

  const handleCustomSlippage = (val: string) => {
    setCustomSlippage(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) setSlippage(parsed);
  };

  const handleSelectToken = (symbol: string) => {
    if (tokenPicker === "from") {
      if (symbol === toToken) setToToken(fromToken);
      setFromToken(symbol);
    } else {
      if (symbol === fromToken) setFromToken(toToken);
      setToToken(symbol);
    }
    setTokenPicker(null);
    setTokenSearch("");
  };

  const filteredTokens = TOKENS.filter(t =>
    t.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
    t.name.toLowerCase().includes(tokenSearch.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Navbar */}
      <header className="shrink-0 z-50 w-full border-b border-border/50 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="http://localhost:5174" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Kembali ke Explorer">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </a>
            <a href="/" className="flex items-center gap-2 group">
              <img src="/logo-garuda.png" alt="GarudaChain" className="w-8 h-8 group-hover:scale-105 transition-transform" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="font-bold text-lg hidden sm:block">
                Garuda<span className="text-[#8B0000]">DEX</span>
              </span>
            </a>
            <nav className="hidden md:flex items-center gap-1 bg-gray-100/80 p-0.5 rounded-xl border border-border/50">
              <button onClick={onSwitchToTrade} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/50 transition-all">
                <BarChart3 className="w-3.5 h-3.5" /> Trade
              </button>
              <button
                onClick={() => setRightPanel("none")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  rightPanel === "none" ? "bg-white text-[#8B0000] shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Swap
              </button>
              <button
                onClick={() => setRightPanel("eipo")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  rightPanel === "eipo" ? "bg-white text-[#8B0000] shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> e-IPO
              </button>
              <button
                onClick={() => setRightPanel("portfolio")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  rightPanel === "portfolio" ? "bg-white text-[#8B0000] shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}
              >
                <Wallet className="w-3.5 h-3.5" /> Portofolio
              </button>
            </nav>
          </div>
          <div>
            {wallet.isConnected ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  Deposit
                </button>
                <AccountDropdown
                  wallet={wallet}
                  onDeposit={() => setShowDepositModal(true)}
                  onWithdraw={() => setShowWithdrawModal(true)}
                  onDisconnect={wallet.disconnect}
                />
              </div>
            ) : (
              <button onClick={() => setShowWalletModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] transition-colors shadow-lg shadow-[#8B0000]/20">
                <Wallet className="w-4 h-4" /> Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Ticker Tape */}
      <div className="w-full bg-gray-50 border-b border-border/50 overflow-hidden flex h-8 items-center relative shrink-0">
        <div className="absolute left-0 w-8 h-full bg-gradient-to-r from-gray-50 to-transparent z-10" />
        <div className="absolute right-0 w-8 h-full bg-gradient-to-l from-gray-50 to-transparent z-10" />
        <div className="flex whitespace-nowrap px-4 gap-8 animate-[ticker_300s_linear_infinite]">
          {[...onChainStocks, ...onChainStocks].map((stock, i) => (
            <div key={`${stock.symbol}-${i}`} className="flex items-center gap-2 text-xs font-medium">
              <span className="font-bold text-foreground">{stock.symbol}</span>
              <span>{fmt(stock.price)}</span>
              <span style={{ color: stock.change >= 0 ? "#16c784" : "#ea3943" }}>
                {stock.change >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden">
        {/* Swap Card */}
        <div className="w-full max-w-md mx-auto overflow-y-auto p-4 flex items-start justify-center shrink-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="w-full"
          >
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-border shadow-2xl p-6 relative overflow-visible">
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#8B0000]/10 rounded-full blur-[60px] pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[#8B0000]/5 rounded-full blur-[60px] pointer-events-none" />

              <div className="flex justify-between items-center mb-6 relative z-10">
                <div>
                  <h2 className="text-2xl font-bold">Swap Token</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Tukar antar token — routing otomatis via GRD</p>
                </div>
                <div className="relative" ref={settingsRef}>
                  <button
                    onClick={() => setShowSettings((v) => !v)}
                    className={`p-2 rounded-full transition-colors ${showSettings ? "bg-[#8B0000] text-white" : "text-muted-foreground hover:text-foreground hover:bg-gray-100"}`}
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {showSettings && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: -8 }}
                        className="absolute right-0 top-12 z-50 w-72 bg-white border border-border rounded-2xl shadow-xl p-4"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <span className="font-semibold text-sm">Pengaturan Transaksi</span>
                          <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Toleransi Slippage</span>
                            <Info className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <div className="flex gap-2 mb-3">
                            {SLIPPAGE_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                onClick={() => { setSlippage(preset); setCustomSlippage(""); }}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                  slippage === preset && !customSlippage ? "bg-[#8B0000] text-white border-[#8B0000]" : "bg-gray-50 text-foreground border-border hover:border-[#8B0000]"
                                }`}
                              >
                                {preset}%
                              </button>
                            ))}
                          </div>
                          <input
                            type="number" min="0.01" max="50" step="0.1" placeholder="Kustom..."
                            value={customSlippage}
                            onChange={(e) => handleCustomSlippage(e.target.value)}
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8B0000] transition-colors"
                          />
                          {slippage > 5 && (
                            <p className="text-xs text-amber-500 mt-2">Slippage tinggi — transaksi mungkin tidak menguntungkan</p>
                          )}
                        </div>
                        <div className="mt-4 pt-3 border-t border-border/50 flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Slippage aktif</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${slippage > 5 ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}`}>
                            {slippage}%
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-2 relative z-[5]">
                {/* FROM */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-border/50 hover:border-border transition-colors">
                  <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span>Pay</span>
                    <span>Balance: {fromBalance !== null ? fmtNum(fromBalance, 4) + " " + fromToken : "—"}</span>
                  </div>
                  <button
                    onClick={() => setTokenPicker("from")}
                    className="mb-2 flex items-center gap-1.5 bg-white border border-border shadow-sm rounded-lg px-3 py-1.5 text-sm font-bold cursor-pointer hover:border-[#8B0000] transition-colors"
                  >
                    <AssetLogo symbol={fromToken} size={20} tipe={onChainStocks.find(s => s.symbol === fromToken)?.tipe ?? "NATIVE"} />
                    {fromToken} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <input
                    type="number"
                    placeholder="0.0"
                    className="w-full border-0 bg-transparent p-0 text-3xl h-12 outline-none font-mono text-foreground"
                    {...register("amount")}
                  />
                  {errors.amount && <p className="text-xs text-red-500 mt-2">{errors.amount.message as string}</p>}
                </div>

                {/* Swap button */}
                <div className="relative h-4 flex items-center justify-center my-2">
                  <div className="absolute w-full h-[1px] bg-border/50" />
                  <button
                    onClick={handleSwapTokens}
                    onMouseEnter={() => setIsHoveringSwap(true)}
                    onMouseLeave={() => setIsHoveringSwap(false)}
                    className="relative z-10 bg-white border-2 border-border p-2 rounded-xl text-muted-foreground hover:text-[#8B0000] hover:border-[#8B0000] hover:scale-110 transition-all shadow-sm"
                  >
                    <motion.div animate={{ rotate: isHoveringSwap ? 180 : 0 }}>
                      <ArrowDownUp className="w-5 h-5" />
                    </motion.div>
                  </button>
                </div>

                {/* TO */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-border/50 hover:border-border transition-colors">
                  <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span>Receive</span>
                    <span>Balance: {toBalance !== null ? fmtNum(toBalance, 4) + " " + toToken : "—"}</span>
                  </div>
                  <button
                    onClick={() => setTokenPicker("to")}
                    className="mb-2 flex items-center gap-1.5 bg-white border border-border shadow-sm rounded-lg px-3 py-1.5 text-sm font-bold cursor-pointer hover:border-[#8B0000] transition-colors"
                  >
                    <AssetLogo symbol={toToken} size={20} tipe={onChainStocks.find(s => s.symbol === toToken)?.tipe ?? "NATIVE"} />
                    {toToken} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <input
                    type="text"
                    readOnly
                    value={amount > 0 ? fmtNum(toAmount, 6) : ""}
                    placeholder="0.0"
                    className="w-full border-0 bg-transparent p-0 text-3xl h-12 outline-none font-mono text-foreground"
                  />
                </div>

                {/* Quote */}
                {amount > 0 && (
                  <div className="p-4 rounded-xl border border-red-100 bg-red-50/30 mt-4 space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-muted-foreground">Exchange Rate</span>
                      <span>1 {fromToken} = {fmtNum(exchangeRate, 6)} {toToken}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-muted-foreground flex items-center gap-1">Network Fee <Info className="w-3 h-3" /></span>
                      <span>{fmtNum(fee, 2)} {fromToken}</span>
                    </div>
                  </div>
                )}

                {/* Action */}
                <div className="pt-4">
                  {!wallet.isConnected ? (
                    <button onClick={() => setShowWalletModal(true)} className="w-full h-14 text-lg font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] rounded-xl transition-colors">
                      Connect Wallet
                    </button>
                  ) : amount === 0 ? (
                    <button disabled className="w-full h-14 text-lg font-bold bg-gray-100 text-muted-foreground rounded-xl cursor-not-allowed">
                      Enter an amount
                    </button>
                  ) : (
                    <button onClick={handleExecute} className="w-full h-14 text-lg font-bold text-white bg-[#8B0000] hover:bg-[#6B0000] rounded-xl transition-colors">
                      Confirm Swap
                    </button>
                  )}
                  <div className="text-center mt-3">
                    <p className="text-[11px] text-muted-foreground">
                      Token → Token dieksekusi otomatis routing via GRD.{" "}
                      <button onClick={onSwitchToTrade} className="text-[#8B0000] font-semibold hover:underline">
                        Order Book →
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* DIVIDER + Right Panel */}
        {rightPanel !== "none" && (
          <>
            <div className="hidden lg:block w-px bg-border shrink-0" />
            {rightPanel === "eipo" ? <EIPOPanel /> : <PortfolioPanel wallet={wallet} onConnectWallet={() => setShowWalletModal(true)} onDeposit={() => setShowDepositModal(true)} onWithdraw={() => setShowWithdrawModal(true)} />}
          </>
        )}
      </main>

      {/* Token Picker Overlay */}
      <AnimatePresence>
        {tokenPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { setTokenPicker(null); setTokenSearch(""); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-border overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-bold text-lg">Pilih Token</h3>
                <button onClick={() => { setTokenPicker(null); setTokenSearch(""); }} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Cari nama atau simbol token..."
                    value={tokenSearch}
                    onChange={(e) => setTokenSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-gray-50 text-sm outline-none focus:border-[#8B0000] transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              {/* Token List */}
              <div className="max-h-80 overflow-y-auto p-2">
                {filteredTokens.map((token) => {
                  const isSelected = tokenPicker === "from" ? token.symbol === fromToken : token.symbol === toToken;
                  return (
                    <button
                      key={token.symbol}
                      onClick={() => handleSelectToken(token.symbol)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                        isSelected ? "bg-[#8B0000]/5 border border-[#8B0000]/20" : "hover:bg-gray-50 border border-transparent"
                      }`}
                    >
                      <AssetLogo symbol={token.symbol} size={36} tipe={token.type} />
                      <div className="flex-1">
                        <div className="font-bold text-sm">{token.symbol}</div>
                        <div className="text-xs text-muted-foreground">{token.name}</div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-muted-foreground">{token.type}</span>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-[#8B0000]" />}
                    </button>
                  );
                })}
                {filteredTokens.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">Token tidak ditemukan</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <ConnectWalletModal open={showWalletModal} onClose={() => setShowWalletModal(false)} wallet={wallet} />
      <DepositWithdrawModal open={showDepositModal} onClose={() => setShowDepositModal(false)} wallet={wallet} defaultTab="deposit" />
      <DepositWithdrawModal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} wallet={wallet} defaultTab="withdraw" />
    </div>
  );
}

// ─── Main DEX Export ───
export function DEX() {
  const [tab, setTab] = useState<"trade" | "swap" | "eipo" | "portfolio">("trade");
  const { stocks: dexStocks } = useOnChainStocks();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "swap") setTab("swap");
    if (params.get("tab") === "eipo") setTab("eipo");
    if (params.get("tab") === "portfolio") setTab("portfolio");
  }, []);

  const goTrade = () => setTab("trade");
  const goSwap = () => setTab("swap");
  const goEIPO = () => setTab("eipo");
  const goPortfolio = () => setTab("portfolio");

  return (
    <div className="h-screen w-screen overflow-hidden">
      {tab === "trade" && (
        <div className="h-full w-full">
          <TradePage onSwitchToSwap={goSwap} onSwitchToEIPO={goEIPO} onSwitchToPortfolio={goPortfolio} />
        </div>
      )}
      {tab === "swap" && (
        <div className="h-full w-full">
          <SwapPage onSwitchToTrade={goTrade} onChainStocks={dexStocks} />
        </div>
      )}
      {tab === "eipo" && (
        <div className="h-full w-full">
          <SwapPage onSwitchToTrade={goTrade} showEIPODefault={true} onChainStocks={dexStocks} />
        </div>
      )}
      {tab === "portfolio" && (
        <div className="h-full w-full">
          <SwapPage onSwitchToTrade={goTrade} showPortfolioDefault={true} onChainStocks={dexStocks} />
        </div>
      )}
    </div>
  );
}
