import { useState, useEffect } from "react";

const API = "http://localhost:5000";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

const Ico = {
  back: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M328 112L184 256l144 144" />
    </svg>
  ),
  pencil: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M364.13 125.25L87 403l-23 45 45-23 277.75-277.13z" /><path d="M348.13 141.25l22.62 22.62" />
    </svg>
  ),
  checkmark: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
      <path d="M416 128L192 384l-96-96" />
    </svg>
  ),
  copy: (c = "currentColor", s = 14) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinejoin="round">
      <rect x="128" y="128" width="336" height="336" rx="57" /><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24" />
    </svg>
  ),
  logout: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M304 336v40a40 40 0 01-40 40H104a40 40 0 01-40-40V136a40 40 0 0140-40h152c22.09 0 48 17.91 48 40v40" /><path d="M368 256H176" /><path d="M432 256l-80-80" /><path d="M432 256l-80 80" />
    </svg>
  ),
  arrowUp: (c = "currentColor", s = 14) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M112 244l144-144 144 144" /><path d="M256 120v292" />
    </svg>
  ),
  arrowDown: (c = "currentColor", s = 14) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M400 268L256 412 112 268" /><path d="M256 392V100" />
    </svg>
  ),
};

export function Profil({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState("GarudaChain");
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [txHistory, setTxHistory] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("garuda_username");
    if (saved) setUsername(saved);

    void (async () => {
      try {
        const r = await msg("wallet_getAccounts");
        const addr = r?.result?.[0]?.address;
        if (!addr) return;
        setAddress(addr);
        const info = await msg("wallet_getAddressInfo", { address: addr });
        if (info?.result) {
          setBalance(info.result.balance ?? 0);
          setTxCount(info.result.transactions?.length ?? 0);
          setTxHistory((info.result.transactions ?? []).slice(0, 8));
        }
      } catch {}
    })();
  }, []);

  function handleCopy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleEditToggle() {
    if (editMode) {
      localStorage.setItem("garuda_username", username);
    }
    setEditMode(!editMode);
  }

  function handleLogout() {
    if (window.confirm("Yakin ingin keluar dari akun? Pastikan frasa pemulihan sudah disimpan.")) {
      chrome.storage.local.clear();
      localStorage.clear();
      onLogout();
    }
  }

  function fmt(n: number) {
    return (n / 1e8).toLocaleString("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  function fmtDate(ts?: number) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600, background: "var(--neo-bg)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <button onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 12, background: "var(--neo-bg)",
          boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>{Ico.back("var(--neo-text)")}</button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Profil Saya</span>
        <button onClick={handleEditToggle} style={{
          width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {editMode ? Ico.checkmark("var(--neo-accent)") : Ico.pencil("var(--neo-muted)")}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        {/* Avatar Card */}
        <div style={{
          borderRadius: 20, padding: 24, marginBottom: 16,
          background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-lg)",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          {/* Avatar */}
          <div style={{
            width: 80, height: 80, borderRadius: 40,
            background: "var(--neo-accent)", display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "#fff" }}>
              {username.slice(0, 2).toUpperCase()}
            </span>
          </div>

          {/* Username */}
          {editMode ? (
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus
              style={{
                textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--neo-text)",
                background: "transparent", border: "none", borderBottom: "2px solid var(--neo-accent)",
                boxShadow: "none", borderRadius: 0, padding: "4px 8px", outline: "none",
              }} />
          ) : (
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--neo-text)" }}>@{username}</p>
          )}

          {/* Address */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 13, color: "var(--neo-muted)" }}>
              {address ? `${address.slice(0, 14)}...${address.slice(-8)}` : "—"}
            </span>
            <button onClick={handleCopy} style={{ display: "flex", color: "var(--neo-muted)" }}>
              {copied ? Ico.checkmark("#22C55E", 14) : Ico.copy("var(--neo-muted)")}
            </button>
          </div>
          {copied && <span style={{ fontSize: 11, color: "#22C55E", marginTop: 4 }}>Tersalin!</span>}
        </div>

        {/* Stats Row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Total Transaksi", value: String(txCount) },
            { label: "Saldo GRD", value: fmt(balance) },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, borderRadius: 16, padding: 16, textAlign: "center",
              background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)",
            }}>
              <p style={{ fontSize: 11, color: "var(--neo-muted)", marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--neo-text)" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{
            flex: 1, borderRadius: 14, padding: "12px 14px",
            background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16, background: "#22C55E22",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {Ico.checkmark("#22C55E", 16)}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)" }}>Terverifikasi</span>
          </div>
          <div style={{
            flex: 1, borderRadius: 14, padding: "12px 14px",
            background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16, background: "var(--neo-accent)22",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--neo-accent)" }}>G</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)" }}>GarudaChain</span>
          </div>
        </div>

        {/* Transaction History */}
        {txHistory.length > 0 && (
          <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--neo-text)" }}>Riwayat Transaksi</p>
            </div>
            {txHistory.map((tx: any, i: number) => {
              const isSend = tx.type === "send";
              return (
                <div key={tx.txid || i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                  ...(i > 0 ? { borderTop: "1px solid rgba(0,0,0,0.05)" } : {}),
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16, flexShrink: 0,
                    background: isSend ? "#EF444422" : "#22C55E22",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isSend ? Ico.arrowUp("#EF4444") : Ico.arrowDown("#22C55E")}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)" }}>{isSend ? "Kirim" : "Terima"}</p>
                    <p style={{ fontSize: 11, color: "var(--neo-muted)" }}>{fmtDate(tx.timestamp)}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: isSend ? "#EF4444" : "#22C55E" }}>
                      {isSend ? "-" : "+"}{fmt(tx.amount || 0)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Logout button */}
        <button onClick={handleLogout} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          height: 48, borderRadius: 14, border: "1.5px solid #EF4444",
        }}>
          <span style={{ display: "flex" }}>{Ico.logout("#EF4444")}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#EF4444" }}>Keluar dari Akun</span>
        </button>
      </div>
    </div>
  );
}
