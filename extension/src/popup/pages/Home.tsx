import { useState, useEffect } from "react";

const API = "http://localhost:5000";

interface Asset { asset_id: string; symbol: string; balance: number }
interface Account { name: string; address: string; derivationPath: string; index: number }
interface StablecoinEntry { assetId: string; symbol: string; name: string }
interface StockEntry { assetId: string; symbol: string; name: string }

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

/* ── SVG Icons (matching mobile Ionicons) ── */
const Icon = {
  lock: (color = "currentColor", size = 20) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M336 208v-95a80 80 0 00-160 0v95" /><rect x="96" y="208" width="320" height="272" rx="48" fill={color} opacity=".15" /><rect x="96" y="208" width="320" height="272" rx="48" />
    </svg>
  ),
  eye: (color = "currentColor", size = 18) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 000-17.47C428.89 172.28 347.8 112 255.66 112z" />
      <circle cx="256" cy="256" r="80" />
    </svg>
  ),
  eyeOff: (color = "currentColor", size = 18) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M432 448l-368-384" /><path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77c15.85 26.08 39.11 54.52 63.11 76.33m56.42 38.46C176.2 390.52 214.91 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 000-17.47 382.3 382.3 0 00-63.79-75.38" /><path d="M175.2 175.2a112 112 0 00161.6 161.6m-21.17-104a80.1 80.1 0 00-83.43-15.8" />
    </svg>
  ),
  copy: (color = "currentColor", size = 13) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinejoin="round">
      <rect x="128" y="128" width="336" height="336" rx="57" /><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24" />
    </svg>
  ),
  arrowDown: (color = "currentColor", size = 22) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M256 112v288" /><path d="M400 256L256 400 112 256" />
    </svg>
  ),
  arrowForward: (color = "currentColor", size = 22) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M268 112l144 144-144 144" /><path d="M392 256H100" />
    </svg>
  ),
  swapVertical: (color = "currentColor", size = 22) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M350 96l-70 70 70 70" /><path d="M280 166h152" /><path d="M162 416l70-70-70-70" /><path d="M232 346H80" />
    </svg>
  ),
  refresh: (color = "currentColor", size = 22) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M320 146s24.36-12-64-12a160 160 0 10160 160" /><path d="M256 58l80 80-80 80" />
    </svg>
  ),
  notifications: (color = "currentColor", size = 22) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M427.68 351.43C402 320 383.87 304 383.87 217.35 383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 37.47c-1.35 4.6-5.52 8.71-9.95 10.53-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43 73.68 364.45 83 384 101.61 384h308.78c18.57 0 27.89-19.55 17.29-32.57z" />
      <path d="M320 384v16a64 64 0 01-128 0v-16" />
    </svg>
  ),
  checkmark: (color = "currentColor", size = 12) => (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" stroke={color} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M416 128L192 384l-96-96" />
    </svg>
  ),
};

const ACTIONS = [
  { key: "terima", label: "Terima", icon: "arrowDown" as const },
  { key: "kirim",  label: "Kirim",  icon: "arrowForward" as const },
  { key: "swap",   label: "Swap",   icon: "swapVertical" as const },
  { key: "refresh", label: "Refresh", icon: "refresh" as const },
];

const sIco = (d: string, c = "#C8922A", s = 18) => (
  <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const SIDEBAR_MENU = [
  [
    { key: "profil", label: "Profil Saya", icon: sIco("M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208 208-93.31 208-208S370.69 48 256 48zm0 86a68 68 0 1168 68 68 68 0 01-68-68zm0 258c-56.26 0-105.91-28.47-135.24-71.81C143.38 286.1 220.17 270 256 270s112.62 16.1 135.24 50.19C361.91 363.53 312.26 392 256 392z"), badge: null },
    { key: "detail-aset", label: "Detail Aset", icon: sIco("M104 160h304M104 256h208M104 352h128", "#627EEA"), badge: null },
    { key: "notifikasi", label: "Notifikasi", icon: sIco("M427.68 351.43C402 320 383.87 304 383.87 217.35 383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 37.47c-1.35 4.6-5.52 8.71-9.95 10.53-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43 73.68 364.45 83 384 101.61 384h308.78c18.57 0 27.89-19.55 17.29-32.57z"), badge: null },
  ],
  [
    { key: "keamanan", label: "Keamanan & Privasi", icon: sIco("M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63z", "#EF4444"), badge: null },
    { key: "buku-alamat", label: "Buku Alamat", icon: sIco("M256 160c16-63.16 76.16-95.41 208-96a15.94 15.94 0 0116 16v288a16 16 0 01-16 16c-128 0-177.45 25.81-208 64-30.37-38-80-64-208-64-9.88 0-16-8.05-16-17.93V80a15.94 15.94 0 0116-16c131.84.59 192 32.84 208 96z", "#22C55E"), badge: null },
  ],
  [
    { key: "import-frasa", label: "Impor Akun (Frasa)", icon: sIco("M256 48v416M400 176L256 48 112 176", "#8B5CF6"), badge: null },
    { key: "import-privat", label: "Impor Kunci Privat", icon: sIco("M218.1 167.17c0 13 0 25.6 4.1 37.4-43.1 50.6-156.9 184.3-167.5 194.5a20.17 20.17 0 00-6.7 15c0 8.5 5.2 16.7 9.6 21.3 6.6 6.9 34.8 33 40 28 15.4-15 18.5-19 24.8-25.2 9.5-9.3-1-28.3 2.3-36s6.8-9.2 12.5-10.4 17.8 7.4 24.9.5 13.7-32.1 19.8-42.3c1.3-2.2 2.7-3.7 4.1-4.7m0 0c10.4-8.5 25.2-16.3 37.2-16.3a58 58 0 010 116c-21.1 0-38.4-11.3-49.4-26.4", "#F59E0B"), badge: null },
  ],
];

export function Home({ onLogout, onSend, onReceive, onUnlocked, onNavigate }: {
  onLogout: () => void; onSend: () => void; onReceive: () => void;
  onUnlocked?: () => void; onNavigate?: (page: string) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selIdx, setSelIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [balGrd, setBalGrd] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetSubTab, setAssetSubTab] = useState<"kripto"|"stablecoin"|"saham">("kripto");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balVisible, setBalVisible] = useState(true);
  const [liveStablecoins, setLiveStablecoins] = useState<StablecoinEntry[]>([]);
  const [liveStocks, setLiveStocks] = useState<StockEntry[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const nav = (p: string) => { setShowSidebar(false); onNavigate?.(p); };

  const sel = accounts[selIdx];

  useEffect(() => {
    msg("wallet_isUnlocked").then((r: any) => {
      if (r?.result) loadAccounts();
      else setLocked(true);
    });
  }, []);

  // Load stablecoins & stocks
  useEffect(() => {
    void (async () => {
      setAssetsLoading(true);
      try {
        const [sc, st] = await Promise.all([
          fetch(`${API}/api/blockchain/stablecoins`).then(r => r.json()).catch(() => []),
          fetch(`${API}/api/blockchain/stocks`).then(r => r.json()).catch(() => []),
        ]);
        setLiveStablecoins(Array.isArray(sc) ? sc.map((s: any) => ({ assetId: s.assetId, symbol: s.symbol, name: s.name })) : []);
        setLiveStocks(Array.isArray(st) ? st.map((s: any) => ({ assetId: s.assetId, symbol: s.kode || s.symbol, name: s.nama || s.name })) : []);
      } catch { /* ignore */ }
      finally { setAssetsLoading(false); }
    })();
  }, []);

  async function loadAccounts() {
    const r = await msg("wallet_getAccounts");
    const accs: Account[] = r?.result || [];
    setAccounts(accs);
    if (accs[0]) loadBalance(accs[0].address);
  }

  async function loadBalance(addr: string) {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/dex/wallet/connect`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ address: addr }),
      }).then(r => r.json());
      if (r.connected) {
        setBalGrd(r.balance_grd || 0);
        setAssets((r.assets || []).filter((a: Asset) => a.balance > 0));
      }
    } finally { setLoading(false); }
  }

  async function unlock() {
    setLoginErr("");
    const r = await msg("wallet_unlock", { password });
    if (r?.result) { setLocked(false); setPassword(""); loadAccounts(); if (onUnlocked) onUnlocked(); }
    else setLoginErr("Password salah");
  }

  async function lock() {
    await msg("wallet_lock");
    setLocked(true); setAccounts([]); setBalGrd(0); setAssets([]);
  }

  function copyAddr() {
    if (!sel) return;
    navigator.clipboard.writeText(sel.address);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function fmt(n: number) {
    return n.toLocaleString("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  /* ── Locked Screen — sama mobile unlock.tsx ── */
  if (locked) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-between",
      height:600, padding:"52px 28px 54px", background:"var(--neo-bg)",
    }}>
      {/* Logo */}
      <div style={{ alignItems:"center", display:"flex", flexDirection:"column", gap:12, paddingTop:20 }}>
        <div style={{
          width:96, height:96, borderRadius:48, background:"var(--neo-bg)",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"var(--neo-shadow-lg)",
        }}>
          <img src="/images/garuda.png" alt="Garuda" style={{
            width:64, height:64, objectFit:"contain",
          }} className="garuda-gold" />
        </div>
        <p style={{ fontSize:26, fontWeight:700, color:"var(--neo-text)", letterSpacing:"-.5px" }}>Dompet Digital</p>
        <p style={{ fontSize:13, color:"var(--neo-muted)" }}>GarudaChain</p>
      </div>

      {/* Form */}
      <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:14 }}>
        <p style={{ fontSize:15, fontWeight:600, color:"var(--neo-text)", textAlign:"center", marginBottom:4 }}>
          Masukkan Kata Sandi
        </p>
        <div style={{
          display:"flex", alignItems:"center", gap:12,
          background:"var(--neo-bg)", borderRadius:16, padding:"0 16px", height:56,
          boxShadow:"var(--neo-inset-sm)",
        }}>
          <span style={{ color:"var(--neo-muted)", display:"flex" }}>{Icon.lock("var(--neo-muted)", 18)}</span>
          <input
            type={showPw ? "text" : "password"} value={password}
            onChange={e => { setPassword(e.target.value); setLoginErr(""); }}
            onKeyDown={e => e.key === "Enter" && unlock()}
            placeholder="Kata sandi dompet" autoFocus
            style={{ flex:1, border:"none", background:"transparent", boxShadow:"none", padding:0, fontSize:15 }}
          />
          <button onClick={() => setShowPw(!showPw)} style={{ color:"var(--neo-muted)", display:"flex" }}>
            {showPw ? Icon.eyeOff("var(--neo-muted)") : Icon.eye("var(--neo-muted)")}
          </button>
        </div>
        {loginErr && <p style={{ fontSize:13, color:"var(--neo-error)", textAlign:"center" }}>{loginErr}</p>}
        <button
          className="neo-btn neo-btn-primary"
          onClick={unlock} disabled={!password.trim()}
          style={{ opacity: password.trim() ? 1 : 0.5 }}
        >
          Buka Dompet
        </button>
      </div>

      {/* Reset link */}
      <button onClick={onLogout} style={{
        fontSize:13, color:"var(--neo-muted)", textDecoration:"underline", padding:8,
      }}>
        Lupa kata sandi? Reset dengan frasa pemulihan
      </button>
    </div>
  );

  /* ── Main Home — sama mobile beranda.tsx ── */
  return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"var(--neo-bg)" }}>
      {/* Header — hamburger + wallet info + notification */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"16px 20px",
      }}>
        {/* Left: hamburger + wallet name */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Hamburger menu icon */}
          <div onClick={() => setShowSidebar(true)} style={{ display:"flex", flexDirection:"column", gap:4, padding:"4px 0", cursor:"pointer" }}>
            <div style={{ width:20, height:2, borderRadius:1, background:"var(--neo-text)" }} />
            <div style={{ width:14, height:2, borderRadius:1, background:"var(--neo-text)" }} />
            <div style={{ width:17, height:2, borderRadius:1, background:"var(--neo-text)" }} />
          </div>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:5, background:"var(--neo-accent)" }} />
              <span style={{ fontSize:16, fontWeight:600, color:"var(--neo-text)" }}>
                {sel?.name || "Akun 1"}
              </span>
              <svg width="14" height="14" viewBox="0 0 512 512" fill="none" stroke="var(--neo-muted)" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
                <path d="M112 184l144 144 144-144" />
              </svg>
            </div>
            <span style={{ fontSize:12, color:"var(--neo-muted)", marginTop:1, display:"block" }}>Dompet Utama</span>
          </div>
        </div>

        {/* Right: notification + lock */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={() => nav("notifikasi")} style={{
            width:40, height:40, borderRadius:20,
            display:"flex", alignItems:"center", justifyContent:"center",
            position:"relative",
          }}>
            {Icon.notifications("var(--neo-text)")}
            <div style={{
              width:8, height:8, borderRadius:4, background:"var(--neo-accent)",
              position:"absolute", top:8, right:8,
            }} />
          </button>
          <button onClick={lock} style={{
            width:40, height:40, borderRadius:20,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            {Icon.lock("var(--neo-text)", 20)}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>

        {/* Balance Card — neumorphic raised */}
        <div style={{
          borderRadius:24, padding:22, marginBottom:24,
          background:"var(--neo-bg)", boxShadow:"var(--neo-shadow-lg)",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:13, color:"var(--neo-muted)" }}>Saldo GRD</span>
            <button onClick={() => setBalVisible(!balVisible)} style={{ display:"flex", color:"var(--neo-muted)" }}>
              {balVisible ? Icon.eye("var(--neo-muted)") : Icon.eyeOff("var(--neo-muted)")}
            </button>
          </div>
          <p style={{ fontSize:30, fontWeight:700, color:"var(--neo-accent)", letterSpacing:"-.5px", marginTop:6, marginBottom:20 }}>
            {balVisible ? (loading ? "Memuat..." : fmt(balGrd) + " GRD") : "••••••••"}
          </p>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:11, color:"var(--neo-muted)", display:"block", marginBottom:4 }}>Alamat GarudaChain</span>
              <button onClick={copyAddr} style={{
                display:"flex", alignItems:"center", gap:6,
                borderRadius:10, padding:"5px 10px",
                background:"var(--neo-bg)", boxShadow:"var(--neo-inset-sm)",
              }}>
                <span style={{ fontSize:13, fontWeight:500, color:"#2D3748", letterSpacing:".3px" }}>
                  {sel ? `${sel.address.slice(0,10)}...${sel.address.slice(-6)}` : "Belum ada dompet"}
                </span>
                {sel && (
                  copied
                    ? <span style={{ color:"var(--neo-success)", display:"flex" }}>{Icon.checkmark("var(--neo-success)")}</span>
                    : <span style={{ display:"flex" }}>{Icon.copy("var(--neo-muted)")}</span>
                )}
              </button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:8, height:8, borderRadius:4, background:"#22C55E" }} />
              <span style={{ fontSize:13, fontWeight:600, color:"#22C55E" }}>Aktif</span>
            </div>
          </div>
        </div>

        {/* Action buttons row — 4 items, matching mobile ACTIONS */}
        <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:28 }}>
          {ACTIONS.map(a => {
            const fn = a.key === "terima" ? onReceive
                     : a.key === "kirim" ? onSend
                     : a.key === "refresh" ? () => sel && loadBalance(sel.address)
                     : () => {};
            return (
              <button key={a.key} onClick={fn} style={{
                flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:8,
              }}>
                <div style={{
                  width:58, height:58, borderRadius:18,
                  background:"var(--neo-bg)", boxShadow:"5px 5px 12px #D1D5DD, -5px -5px 12px #FFFFFF",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  {Icon[a.icon]("var(--neo-text)", 22)}
                </div>
                <span style={{ fontSize:13, fontWeight:500, color:"var(--neo-text)" }}>{a.label}</span>
              </button>
            );
          })}
        </div>

        {/* Asset sub-tab bar — 3 tabs like mobile */}
        <div style={{
          display:"flex", background:"#E8E8EC", borderRadius:14, padding:3, marginBottom:14,
        }}>
          {(["kripto","stablecoin","saham"] as const).map(t => (
            <button key={t} onClick={() => setAssetSubTab(t)} style={{
              flex:1, textAlign:"center", padding:"8px 0", borderRadius:11,
              fontSize:13, fontWeight: assetSubTab === t ? 700 : 500,
              color: assetSubTab === t ? "var(--neo-text)" : "var(--neo-muted)",
              background: assetSubTab === t ? "var(--neo-bg)" : "transparent",
              boxShadow: assetSubTab === t ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}>
              {t === "kripto" ? "Kripto" : t === "stablecoin" ? "Stablecoin" : "Saham"}
            </button>
          ))}
        </div>

        {/* Kripto tab */}
        {assetSubTab === "kripto" && (
          <div style={{
            borderRadius:20, overflow:"hidden", background:"var(--neo-bg)",
            boxShadow:"var(--neo-shadow)",
          }}>
            {/* GRD native */}
            <div onClick={() => nav("detail-aset")} style={{ cursor:"pointer" }}>
              <AssetRow symbol="GRD" name="GarudaChain" sub="GRD · Native" balance={balVisible ? fmt(balGrd) : "••••"} subRight="GarudaChain" color="var(--neo-accent)" />
            </div>

            {assets.map((a) => (
              <AssetRow key={a.asset_id} symbol={a.symbol} name={a.symbol} sub={`${a.symbol} · Token`}
                balance={balVisible ? a.balance.toLocaleString("id-ID") : "••••"}
                subRight="Token"
                color="#1e40af"
                border
              />
            ))}

            {assets.length === 0 && !loading && (
              <div style={{ padding:24, textAlign:"center" }}>
                <p style={{ fontSize:13, color:"var(--neo-muted)" }}>Belum ada token lain</p>
              </div>
            )}
          </div>
        )}

        {/* Stablecoin tab */}
        {assetSubTab === "stablecoin" && (
          <div style={{
            borderRadius:20, overflow:"hidden", background:"var(--neo-bg)",
            boxShadow:"var(--neo-shadow)",
          }}>
            {assetsLoading && (
              <div style={{ padding:24, textAlign:"center" }}>
                <p style={{ fontSize:13, color:"var(--neo-muted)" }}>Memuat...</p>
              </div>
            )}
            {!assetsLoading && liveStablecoins.length === 0 && (
              <div style={{ padding:24, textAlign:"center" }}>
                <p style={{ fontSize:13, color:"var(--neo-muted)" }}>Belum ada stablecoin</p>
              </div>
            )}
            {liveStablecoins.map((asset, index) => (
              <AssetRow
                key={asset.assetId}
                symbol={asset.symbol}
                name={asset.name}
                sub={`${asset.symbol} · Stablecoin`}
                balance={balVisible ? "0" : "••••"}
                subRight="Stablecoin"
                subRightColor="#2563EB"
                color="#2563EB"
                border={index > 0}
              />
            ))}
          </div>
        )}

        {/* Saham tab */}
        {assetSubTab === "saham" && (
          <div style={{
            borderRadius:20, overflow:"hidden", background:"var(--neo-bg)",
            boxShadow:"var(--neo-shadow)",
          }}>
            {assetsLoading && (
              <div style={{ padding:24, textAlign:"center" }}>
                <p style={{ fontSize:13, color:"var(--neo-muted)" }}>Memuat...</p>
              </div>
            )}
            {!assetsLoading && liveStocks.length === 0 && (
              <div style={{ padding:24, textAlign:"center" }}>
                <p style={{ fontSize:13, color:"var(--neo-muted)" }}>Belum ada saham</p>
              </div>
            )}
            {liveStocks.map((asset, index) => (
              <AssetRow
                key={asset.assetId}
                symbol={asset.symbol}
                name={asset.name}
                sub={`${asset.symbol} · Pasar Saham`}
                balance={balVisible ? "0" : "••••"}
                subRight="Saham"
                subRightColor="#8B0000"
                color="#8B0000"
                border={index > 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Left Sidebar Drawer — sama mobile ── */}
      {showSidebar && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex" }}>
          {/* Backdrop */}
          <div onClick={() => setShowSidebar(false)} style={{
            position:"absolute", inset:0, background:"rgba(0,0,0,0.35)",
          }} />
          {/* Drawer */}
          <div style={{
            position:"relative", width:260, height:"100%",
            background:"var(--neo-bg)", boxShadow:"4px 0px 20px #C0C4CC",
            display:"flex", flexDirection:"column",
            animation:"slideInLeft .2s ease-out",
          }}>
            {/* Drawer header */}
            <div style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"16px 16px 14px", borderBottom:"1px solid rgba(0,0,0,0.07)",
            }}>
              <div style={{
                width:40, height:40, borderRadius:12,
                background:"var(--neo-accent)", display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <span style={{ fontSize:16, fontWeight:700, color:"#fff" }}>
                  {(sel?.name || "A").slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:15, fontWeight:600, color:"var(--neo-text)" }}>{sel?.name || "Akun 1"}</p>
                <p style={{ fontSize:11, color:"var(--neo-muted)" }}>
                  {sel ? `${sel.address.slice(0,8)}...${sel.address.slice(-4)}` : "—"}
                </p>
              </div>
            </div>

            {/* Menu items */}
            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {SIDEBAR_MENU.map((section, si) => (
                <div key={si}>
                  {si > 0 && <div style={{ height:1, background:"rgba(0,0,0,0.06)", margin:"6px 16px" }} />}
                  {section.map(item => (
                    <button key={item.key} onClick={() => nav(item.key)} style={{
                      width:"100%", display:"flex", alignItems:"center", gap:14, padding:"12px 16px",
                      textAlign:"left",
                    }}>
                      <div style={{
                        width:34, height:34, borderRadius:10,
                        background:"var(--neo-bg)", boxShadow:"var(--neo-shadow-sm)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        {item.icon}
                      </div>
                      <span style={{ fontSize:14, fontWeight:500, color:"var(--neo-text)" }}>{item.label}</span>
                      {item.badge && (
                        <span style={{
                          marginLeft:"auto", fontSize:11, fontWeight:600,
                          color:"var(--neo-muted)", background:"#E8E8EC",
                          borderRadius:8, padding:"2px 8px",
                        }}>{item.badge}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Lock wallet button */}
            <div style={{ padding:"12px 16px 24px" }}>
              <button onClick={() => { setShowSidebar(false); lock(); }} style={{
                width:"100%", height:44, borderRadius:14, display:"flex",
                alignItems:"center", justifyContent:"center", gap:8,
                background:"var(--neo-accent)", color:"#fff",
              }}>
                {Icon.lock("#fff", 16)}
                <span style={{ fontSize:14, fontWeight:600 }}>Kunci Dompet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Asset Row — sama mobile beranda assetRow ── */
function AssetRow({ symbol, name, sub, balance, subRight, subRightColor, color, border }: {
  symbol: string; name: string; sub: string; balance: string; color: string;
  subRight?: string; subRightColor?: string; border?: boolean;
}) {
  return (
    <div style={{
      display:"flex", alignItems:"center", padding:14, gap:12,
      ...(border ? { borderTop:"1px solid rgba(0,0,0,0.05)" } : {}),
    }}>
      {/* AssetLogo — matching mobile component */}
      <div style={{
        width:44, height:44, borderRadius:22, flexShrink:0,
        background: `${color}22`, border: `1.5px solid ${color}55`,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        <span style={{ fontSize:18, fontWeight:700, color }}>{symbol.slice(0,1)}</span>
      </div>
      <div style={{ flex:1 }}>
        <p style={{ fontSize:15, fontWeight:600, color:"var(--neo-text)" }}>{name}</p>
        <p style={{ fontSize:12, color:"var(--neo-muted)", marginTop:2 }}>{sub}</p>
      </div>
      <div style={{ textAlign:"right" }}>
        <p style={{ fontSize:14, fontWeight:600, color:"var(--neo-text)" }}>{balance}</p>
        {subRight && (
          <p style={{ fontSize:12, color: subRightColor || "var(--neo-muted)", marginTop:2 }}>{subRight}</p>
        )}
      </div>
    </div>
  );
}
