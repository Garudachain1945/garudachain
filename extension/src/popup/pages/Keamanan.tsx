import { useState, useEffect } from "react";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

/* ── SVG Icons ── */
const Ico = {
  back: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M328 112L184 256l144 144" />
    </svg>
  ),
  fingerprint: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M390.42 75.28a10.45 10.45 0 01-5.32-1.44C340.72 50.08 296.26 36 256 36c-40.16 0-84.72 14.08-129.1 37.84a10.45 10.45 0 01-14.33-4.07 10.68 10.68 0 014-14.56C162.3 30.44 209.68 15 256 15c46.42 0 93.7 15.44 139.52 40.21a10.66 10.66 0 014 14.56 10.42 10.42 0 01-9.1 5.51z" fill={c} />
      <path d="M256 185c-56.07 0-101.68 49.28-101.68 109.84 0 24.58 7.55 46 13.13 59.51a10.76 10.76 0 01-5.58 14 10.34 10.34 0 01-13.72-5.71c-6.42-15.56-15.08-40.31-15.08-67.82C133.07 222.84 188.15 164 256 164s122.93 58.84 122.93 130.84c0 20.36-2.74 38-5.47 49.89a10.58 10.58 0 01-12.59 8 10.77 10.77 0 01-7.84-12.84c2.43-10.6 4.65-26.68 4.65-45.07C357.68 234.28 312.07 185 256 185z" fill={c} />
      <path d="M256 265c-29 0-52.59 26.94-52.59 60.08 0 33.14 23.59 60.08 52.59 60.08s52.59-26.94 52.59-60.08C308.59 291.94 285 265 256 265z" fill={c} />
    </svg>
  ),
  timer: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64z" />
      <path d="M256 128v128l96 64" />
    </svg>
  ),
  eyeOff: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M432 448l-368-384" /><path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77c15.85 26.08 39.11 54.52 63.11 76.33" />
    </svg>
  ),
  shield: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63z" />
    </svg>
  ),
  checkmark: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M416 128L192 384l-96-96" />
    </svg>
  ),
  document: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M416 221.25V416a48 48 0 01-48 48H144a48 48 0 01-48-48V96a48 48 0 0148-48h98.75a32 32 0 0122.62 9.37l141.26 141.26a32 32 0 019.37 22.62z" />
      <path d="M256 56v120a32 32 0 0032 32h120" />
    </svg>
  ),
  trash: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M112 112l20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320" /><path d="M80 112h352" /><path d="M192 112V72h0a23.93 23.93 0 0124-24h80a23.93 23.93 0 0124 24h0v40" />
    </svg>
  ),
  warning: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill={c} stroke="none">
      <path d="M256 32L16 480h480zm0 128l0 160m0 48v16" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  copy: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinejoin="round">
      <rect x="128" y="128" width="336" height="336" rx="57" /><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24" />
    </svg>
  ),
  close: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round">
      <path d="M368 144L144 368" /><path d="M368 368L144 144" />
    </svg>
  ),
};

const SESSION_OPTIONS = [
  { key: "1m", label: "1 menit" },
  { key: "5m", label: "5 menit" },
  { key: "15m", label: "15 menit" },
  { key: "1h", label: "1 jam" },
];

export function Keamanan({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const [autoLock, setAutoLock] = useState(true);
  const [hideBalance, setHideBalance] = useState(false);
  const [antiPhishing, setAntiPhishing] = useState(false);
  const [txConfirm, setTxConfirm] = useState(true);
  const [selectedSession, setSelectedSession] = useState("5m");
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwStep, setPwStep] = useState(false);

  // Load saved settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem("garuda_security");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.autoLock !== undefined) setAutoLock(s.autoLock);
        if (s.hideBalance !== undefined) setHideBalance(s.hideBalance);
        if (s.antiPhishing !== undefined) setAntiPhishing(s.antiPhishing);
        if (s.txConfirm !== undefined) setTxConfirm(s.txConfirm);
        if (s.selectedSession) setSelectedSession(s.selectedSession);
      }
    } catch {}
  }, []);

  function saveSetting(key: string, value: any) {
    try {
      const saved = JSON.parse(localStorage.getItem("garuda_security") || "{}");
      saved[key] = value;
      localStorage.setItem("garuda_security", JSON.stringify(saved));
    } catch {}
  }

  async function handleViewMnemonic() {
    if (!pwStep) { setPwStep(true); return; }
    setPwError("");
    const r = await msg("wallet_exportMnemonic", { password: pwInput });
    if (r?.result) {
      setMnemonic(r.result);
      setShowMnemonic(true);
      setPwStep(false); setPwInput("");
    } else {
      setPwError(r?.error || "Password salah");
    }
  }

  function handleCopyMnemonic() {
    navigator.clipboard.writeText(mnemonic);
    setMnemonicCopied(true);
    setTimeout(() => setMnemonicCopied(false), 2000);
  }

  function handleReset() {
    if (window.confirm("Yakin ingin menghapus dompet? Pastikan Anda sudah menyimpan frasa pemulihan.")) {
      chrome.storage.local.clear();
      localStorage.clear();
      onLogout();
    }
  }

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <div onClick={() => onChange(!value)} style={{
        width: 48, height: 28, borderRadius: 14, padding: 2, cursor: "pointer",
        background: value ? "var(--neo-accent)" : "#D1D5DD",
        transition: "background .2s",
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 12, background: "#fff",
          transform: value ? "translateX(20px)" : "translateX(0)",
          transition: "transform .2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600, background: "var(--neo-bg)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <button onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 12, background: "var(--neo-bg)",
          boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>{Ico.back("var(--neo-text)")}</button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Keamanan & Privasi</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        {/* Authentication section */}
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--neo-muted)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 10 }}>
          Autentikasi
        </p>
        <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)", marginBottom: 20 }}>
          <SettingRow icon={Ico.timer("#22C55E")} label="Kunci Otomatis" right={
            <Toggle value={autoLock} onChange={v => { setAutoLock(v); saveSetting("autoLock", v); }} />
          } />
        </div>

        {/* Auto-lock duration */}
        {autoLock && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {SESSION_OPTIONS.map(o => (
              <button key={o.key} onClick={() => { setSelectedSession(o.key); saveSetting("selectedSession", o.key); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  background: selectedSession === o.key ? "var(--neo-accent)" : "var(--neo-bg)",
                  color: selectedSession === o.key ? "#fff" : "var(--neo-muted)",
                  boxShadow: selectedSession === o.key ? "none" : "var(--neo-shadow-sm)",
                }}>{o.label}</button>
            ))}
          </div>
        )}

        {/* Privacy section */}
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--neo-muted)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 10 }}>
          Privasi
        </p>
        <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)", marginBottom: 20 }}>
          <SettingRow icon={Ico.eyeOff("var(--neo-muted)")} label="Sembunyikan Saldo" right={
            <Toggle value={hideBalance} onChange={v => { setHideBalance(v); saveSetting("hideBalance", v); }} />
          } />
          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 16px" }} />
          <SettingRow icon={Ico.shield("#EF4444")} label="Anti-Phishing" right={
            <Toggle value={antiPhishing} onChange={v => { setAntiPhishing(v); saveSetting("antiPhishing", v); }} />
          } />
          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 16px" }} />
          <SettingRow icon={Ico.checkmark("var(--neo-accent)")} label="Konfirmasi Transaksi" right={
            <Toggle value={txConfirm} onChange={v => { setTxConfirm(v); saveSetting("txConfirm", v); }} />
          } />
        </div>

        {/* Recovery section */}
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--neo-muted)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 10 }}>
          Pemulihan
        </p>
        <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)", marginBottom: 20 }}>
          <button onClick={handleViewMnemonic} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--neo-accent)15", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Ico.document("var(--neo-accent)")}
            </div>
            <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 500, color: "var(--neo-text)" }}>Lihat Frasa Pemulihan</span>
            <svg width="16" height="16" viewBox="0 0 512 512" fill="none" stroke="var(--neo-muted)" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
              <path d="M184 112l144 144-144 144" />
            </svg>
          </button>
        </div>

        {/* Password input for mnemonic */}
        {pwStep && !showMnemonic && (
          <div style={{ borderRadius: 16, padding: 16, background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)", marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", marginBottom: 10 }}>Masukkan password untuk melihat frasa</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" value={pwInput} onChange={e => { setPwInput(e.target.value); setPwError(""); }}
                onKeyDown={e => e.key === "Enter" && handleViewMnemonic()}
                placeholder="Password" autoFocus
                style={{ flex: 1, borderRadius: 12, height: 44, padding: "0 14px", boxShadow: "var(--neo-inset-sm)" }} />
              <button onClick={handleViewMnemonic} style={{
                padding: "0 16px", borderRadius: 12, background: "var(--neo-accent)", color: "#fff", fontWeight: 600, fontSize: 14,
              }}>Buka</button>
            </div>
            {pwError && <p style={{ fontSize: 12, color: "var(--neo-error)", marginTop: 6 }}>{pwError}</p>}
          </div>
        )}

        {/* Warning card */}
        <div style={{
          display: "flex", gap: 10, padding: 14, borderRadius: 12,
          background: "#FEF9EE", border: "1px solid #F0C040", marginBottom: 20,
        }}>
          <span style={{ fontSize: 18, color: "#F59E0B", flexShrink: 0 }}>{Ico.warning("#F59E0B")}</span>
          <p style={{ flex: 1, fontSize: 12, color: "#92400E", lineHeight: "18px" }}>
            Jangan pernah bagikan frasa pemulihan atau kunci privat Anda. Tim GarudaChain tidak akan pernah memintanya.
          </p>
        </div>

        {/* Danger zone */}
        <button onClick={handleReset} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          height: 48, borderRadius: 14, border: "1.5px solid #EF4444",
        }}>
          <span style={{ display: "flex" }}>{Ico.trash("#EF4444", 18)}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#EF4444" }}>Reset & Hapus Dompet</span>
        </button>
      </div>

      {/* Mnemonic Modal */}
      {showMnemonic && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 360, borderRadius: 20, padding: 24,
            background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-lg)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Frasa Pemulihan</span>
              <button onClick={() => { setShowMnemonic(false); setMnemonic(""); }}
                style={{ display: "flex" }}>{Ico.close("var(--neo-muted)")}</button>
            </div>

            <div style={{
              background: "#FEF9EE", borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              border: "1px solid #F0C040",
            }}>
              <p style={{ fontSize: 12, color: "#92400E" }}>Jangan bagikan frasa ini kepada siapapun!</p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", borderRadius: 14, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-inset-sm)", marginBottom: 16 }}>
              {mnemonic.split(" ").map((w, i) => (
                <div key={i} style={{ width: "33.33%", display: "flex", alignItems: "center", gap: 4, padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <span style={{ fontSize: 11, color: "var(--neo-muted)", minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neo-text)" }}>{w}</span>
                </div>
              ))}
            </div>

            <button onClick={handleCopyMnemonic} style={{
              width: "100%", height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: mnemonicCopied ? "#22C55E15" : "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
              color: mnemonicCopied ? "#22C55E" : "var(--neo-muted)", fontWeight: 600, fontSize: 14,
            }}>
              {mnemonicCopied ? (
                <>{Ico.checkmark("#22C55E", 16)} Tersalin!</>
              ) : (
                <>{Ico.copy("var(--neo-muted)")} Salin</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Setting Row ── */
function SettingRow({ icon, label, right }: { icon: JSX.Element; label: string; right: JSX.Element }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "var(--neo-text)" }}>{label}</span>
      {right}
    </div>
  );
}
