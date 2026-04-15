import { useState, useEffect } from "react";
import { GarudaFox } from "../App";

const API = "http://localhost:5000";

interface Asset { asset_id: string; symbol: string; balance: number }
interface Account { name: string; address: string; derivationPath: string; index: number }

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}
function fmt(n: number, d = 4) {
  return n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function Home({ onLogout }: { onLogout: () => void }) {
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [selIdx,     setSelIdx]     = useState(0);
  const [locked,     setLocked]     = useState(false);
  const [password,   setPassword]   = useState("");
  const [loginErr,   setLoginErr]   = useState("");
  const [balGrd,     setBalGrd]     = useState(0);
  const [assets,     setAssets]     = useState<Asset[]>([]);
  const [logoMap,    setLogoMap]    = useState<Record<string, string>>({});
  const [tab,        setTab]        = useState<"tokens"|"activity">("tokens");
  const [loading,    setLoading]    = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [showSend,   setShowSend]   = useState(false);
  const [sendTo,     setSendTo]     = useState("");
  const [sendAmt,    setSendAmt]    = useState("");
  const [sendMsg2,   setSendMsg2]   = useState("");

  const sel = accounts[selIdx];

  useEffect(() => {
    msg("wallet_isUnlocked").then((r: any) => {
      if (r?.result) { loadAccounts(); }
      else setLocked(true);
    });
    fetch(`${API}/api/asset/logos`).then(r => r.json())
      .then(d => { if (d && typeof d === "object") setLogoMap(d); }).catch(() => {});
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
    if (r?.result) { setLocked(false); setPassword(""); loadAccounts(); }
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

  async function addAccount() {
    const r = await msg("wallet_addAccount");
    if (r?.result) loadAccounts();
  }

  /* ── Locked Screen — persis MetaMask ──────────────────────────────────── */
  if (locked) return (
    <div style={{
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      minHeight:600, padding:"32px 28px", gap:24,
      background:"linear-gradient(180deg, #fff5f5 0%, #ffffff 70%)",
    }}>
      <GarudaFox size={100} />

      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:"var(--t1)" }}>GarudaChain Wallet</h2>
        <p style={{ fontSize:13, color:"var(--t3)", marginTop:4 }}>Wallet terkunci</p>
      </div>

      <div style={{ width:"100%", maxWidth:300, display:"flex", flexDirection:"column", gap:12 }}>
        <input
          type="password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && unlock()}
          placeholder="Masukkan password..."
          className="mm-input"
          autoFocus
        />
        {loginErr && (
          <p style={{ fontSize:12, color:"var(--error)", fontWeight:500, textAlign:"center" }}>
            ❌ {loginErr}
          </p>
        )}
        <button className="mm-btn mm-btn-primary" onClick={unlock} disabled={!password}>
          Buka Wallet
        </button>
        <button onClick={onLogout}
          style={{ fontSize:12, color:"var(--t3)", textDecoration:"underline", textAlign:"center" }}>
          Reset Wallet
        </button>
      </div>
    </div>
  );

  /* ── Main Home — MetaMask-style ──────────────────────────────────────── */
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:600, background:"var(--bg)" }}>

      {/* ── Top bar: network badge + account selector ── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 16px", borderBottom:"1px solid var(--border-2)",
        background:"var(--bg)",
      }}>
        {/* Network pill */}
        <div style={{
          display:"flex", alignItems:"center", gap:6,
          background:"var(--bg-alt)", borderRadius:"var(--r-pill)",
          padding:"5px 10px", border:"1px solid var(--border-2)",
        }}>
          <span style={{
            width:8, height:8, borderRadius:"50%",
            background:"var(--success)", boxShadow:"0 0 0 2px rgba(26,138,74,.2)",
            flexShrink:0,
          }} />
          <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>GarudaChain</span>
        </div>

        {/* Account selector */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {accounts.length > 1 && (
            <select value={selIdx}
              onChange={e => { setSelIdx(+e.target.value); loadBalance(accounts[+e.target.value].address); }}
              style={{
                fontSize:12, fontWeight:600, color:"var(--t1)",
                border:"1px solid var(--border-2)", borderRadius:"var(--r-sm)",
                padding:"4px 8px", background:"var(--bg)",
              }}>
              {accounts.map((a, i) => <option key={i} value={i}>{a.name}</option>)}
            </select>
          )}

          {/* Lock button */}
          <button onClick={lock} style={{
            width:32, height:32, borderRadius:"var(--r-sm)",
            background:"var(--bg-alt)", display:"flex",
            alignItems:"center", justifyContent:"center",
            fontSize:14, border:"1px solid var(--border-2)",
          }}>🔒</button>
        </div>
      </div>

      {/* ── Account info + balance ── */}
      <div style={{
        padding:"20px 20px 16px", textAlign:"center",
        borderBottom:"1px solid var(--border-2)",
        background:"linear-gradient(180deg, #fff5f5 0%, #fff 100%)",
      }}>
        {/* Avatar circle */}
        <div style={{
          width:48, height:48, borderRadius:"50%",
          background:"linear-gradient(135deg, var(--primary), #c0392b)",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"white", fontWeight:800, fontSize:18,
          margin:"0 auto 10px",
          boxShadow:"var(--s-brand)",
        }}>
          {sel ? sel.name.slice(0,1).toUpperCase() : "G"}
        </div>

        {/* Account name + address */}
        {sel && (
          <>
            <p style={{ fontSize:14, fontWeight:700, color:"var(--t1)", marginBottom:4 }}>
              {sel.name}
            </p>
            <button onClick={copyAddr} style={{
              display:"inline-flex", alignItems:"center", gap:5,
              background:"var(--bg-alt)", borderRadius:"var(--r-pill)",
              padding:"4px 10px", border:"1px solid var(--border-2)",
            }}>
              <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--t2)" }}>
                {sel.address.slice(0,8)}...{sel.address.slice(-6)}
              </span>
              <span style={{ fontSize:12 }}>{copied ? "✓" : "📋"}</span>
            </button>
          </>
        )}

        {/* Balance */}
        <div style={{ marginTop:14 }}>
          <p style={{ fontSize:30, fontWeight:800, color:"var(--t1)", letterSpacing:"-.02em", fontFamily:"monospace" }}>
            {loading ? (
              <span style={{ fontSize:18, color:"var(--t3)" }}>Memuat...</span>
            ) : (
              <>{fmt(balGrd)} <span style={{ fontSize:16, fontWeight:600, color:"var(--t2)" }}>GRD</span></>
            )}
          </p>
        </div>
      </div>

      {/* ── Action row — seperti MetaMask: Buy/Send/Receive/Swap ── */}
      <div style={{
        display:"flex", gap:4, padding:"12px 12px",
        borderBottom:"1px solid var(--border-2)",
      }}>
        {[
          { icon:"📥", label:"Terima", onClick: () => copyAddr() },
          { icon:"📤", label:"Kirim",  onClick: () => setShowSend(!showSend) },
          { icon:"+",  label:"Akun",   onClick: addAccount },
          { icon:"🔄", label:"Refresh",onClick: () => sel && loadBalance(sel.address) },
        ].map(({ icon, label, onClick }) => (
          <button key={label} onClick={onClick} style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", gap:4, padding:"10px 4px",
            borderRadius:"var(--r-md)",
            background:"var(--bg-alt)",
            border:"1px solid var(--border-2)",
            transition:"background .15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--primary-bg)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-alt)")}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span style={{ fontSize:10, fontWeight:600, color:"var(--t2)" }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Send panel (inline) ── */}
      {showSend && (
        <div style={{
          padding:"12px 16px", borderBottom:"1px solid var(--border-2)",
          background:"var(--bg-alt)", display:"flex", flexDirection:"column", gap:10,
        }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--t1)" }}>Kirim GRD</p>
          <input className="mm-input" placeholder="Alamat tujuan grd1q..."
            value={sendTo} onChange={e => setSendTo(e.target.value)} />
          <input className="mm-input" type="number" placeholder="Jumlah GRD"
            value={sendAmt} onChange={e => setSendAmt(e.target.value)} />
          {sendMsg2 && <p style={{ fontSize:11, color:"var(--t2)" }}>{sendMsg2}</p>}
          <div style={{ display:"flex", gap:8 }}>
            <button className="mm-btn mm-btn-ghost mm-btn-sm" style={{ flex:1 }}
              onClick={() => setShowSend(false)}>Batal</button>
            <button className="mm-btn mm-btn-primary mm-btn-sm" style={{ flex:1 }}
              disabled={!sendTo || !sendAmt}
              onClick={() => { setSendMsg2("Fitur kirim GRD akan segera hadir"); setTimeout(() => setSendMsg2(""), 3000); }}>
              Kirim
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs: Tokens | Activity ── */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--border-2)", padding:"0 16px" }}>
        {(["tokens","activity"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:"10px 16px 9px",
            fontSize:13, fontWeight:tab === t ? 700 : 500,
            color: tab === t ? "var(--primary)" : "var(--t3)",
            borderBottom: `2px solid ${tab === t ? "var(--primary)" : "transparent"}`,
            marginBottom:-1,
            transition:"color .15s",
          }}>
            {t === "tokens" ? "Token" : "Aktivitas"}
          </button>
        ))}
      </div>

      {/* ── Token list ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"8px 12px 16px" }}>
        {tab === "tokens" && (
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {/* GRD native */}
            <TokenRow symbol="GRD" name="GRD (Native)" balance={balGrd} decimals={4}
              logo={logoMap["GRD"]} isNative />

            {assets.length === 0 && !loading && (
              <div style={{ textAlign:"center", padding:"24px 0" }}>
                <p style={{ fontSize:13, color:"var(--t3)" }}>Belum ada token</p>
                <p style={{ fontSize:11, color:"var(--t3)", marginTop:4 }}>Beli atau terima aset melalui DEX</p>
              </div>
            )}

            {assets.map(a => (
              <TokenRow key={a.asset_id} symbol={a.symbol} name={a.symbol}
                balance={a.balance} decimals={0} logo={logoMap[a.symbol.toUpperCase()]} />
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div style={{ textAlign:"center", padding:"32px 0" }}>
            <p style={{ fontSize:32 }}>📋</p>
            <p style={{ fontSize:13, color:"var(--t3)", marginTop:8 }}>Belum ada transaksi</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Token Row — seperti MetaMask asset list ─────────────────────────────── */
function TokenRow({ symbol, name, balance, decimals, logo, isNative }: {
  symbol: string; name: string; balance: number;
  decimals: number; logo?: string; isNative?: boolean;
}) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      padding:"10px 10px", borderRadius:"var(--r-md)",
      transition:"background .15s", cursor:"default",
    }}
    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

      {/* Token icon */}
      {logo ? (
        <img src={logo} alt={symbol}
          style={{ width:36, height:36, borderRadius:"50%", objectFit:"contain", flexShrink:0 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div style={{
          width:36, height:36, borderRadius:"50%", flexShrink:0,
          background: isNative
            ? "linear-gradient(135deg, var(--primary), #c0392b)"
            : "linear-gradient(135deg, #1e40af, #3b82f6)",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"white", fontWeight:800, fontSize:11,
        }}>
          {symbol.slice(0, 3).toUpperCase()}
        </div>
      )}

      {/* Name */}
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:700, color:"var(--t1)" }}>{symbol}</p>
        <p style={{ fontSize:11, color:"var(--t3)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {isNative ? "Native Coin" : "Token GarudaChain"}
        </p>
      </div>

      {/* Balance */}
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <p style={{ fontSize:14, fontWeight:700, color:"var(--t1)", fontFamily:"monospace" }}>
          {balance.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        </p>
        <p style={{ fontSize:11, color:"var(--t3)" }}>{symbol}</p>
      </div>
    </div>
  );
}
