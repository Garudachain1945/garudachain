import { useState } from "react";
import { validateMnemonic } from "@/crypto/wallet";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

const Ico = {
  back: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M328 112L184 256l144 144" />
    </svg>
  ),
  info: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M256 56C145.72 56 56 145.72 56 256s89.72 200 200 200 200-89.72 200-200S366.28 56 256 56z" />
      <path d="M256 232v120" /><circle cx="256" cy="172" r="12" fill={c} />
    </svg>
  ),
  close: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round">
      <path d="M368 144L144 368" /><path d="M368 368L144 144" />
    </svg>
  ),
};

export function ImportAkunFrasa({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [name, setName] = useState("Akun Impor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  const wc = phrase.trim() === "" ? 0 : phrase.trim().split(/\s+/).length;
  const isValid = (wc === 12 || wc === 24) && validateMnemonic(phrase.trim().toLowerCase());

  async function handlePaste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setPhrase(t);
    } catch {}
  }

  async function handleImport() {
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
      // Add new account using phrase
      const clean = phrase.trim().toLowerCase().replace(/\s+/g, " ");
      const r = await msg("wallet_addAccount");
      if (r?.result) {
        onDone();
      } else {
        setError(r?.error || "Gagal mengimpor akun");
      }
    } catch (e: any) {
      setError(e.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
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
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Impor Frasa Pemulihan</span>
        <button onClick={() => setShowInfo(true)} style={{
          width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{Ico.info("var(--neo-muted)")}</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        <p style={{ fontSize: 14, color: "var(--neo-muted)", lineHeight: "21px", marginBottom: 20 }}>
          Impor akun baru ke dompet Anda menggunakan frasa pemulihan 12 atau 24 kata.
        </p>

        {/* Account Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>
            Nama Akun
          </label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama akun"
            style={{ height: 48, borderRadius: 12, boxShadow: "var(--neo-inset-sm)" }} />
        </div>

        {/* Phrase input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>
            Frasa Pemulihan (12 atau 24 kata)
          </label>
          <div style={{
            borderRadius: 16, padding: 16, minHeight: 140,
            border: `1.5px solid ${phrase.length > 0 ? "var(--neo-accent)" : "var(--neo-border)"}`,
            background: "var(--neo-bg)",
          }}>
            <textarea value={phrase}
              onChange={e => { setError(""); setPhrase(e.target.value); }}
              placeholder="Tambahkan spasi di antara setiap kata..."
              autoComplete="off" spellCheck={false}
              style={{
                width: "100%", minHeight: 100, border: "none", background: "transparent",
                boxShadow: "none", padding: 0, fontSize: 15, lineHeight: "22px",
                resize: "none", outline: "none", color: "var(--neo-text)",
              }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={handlePaste} style={{
                fontSize: 14, fontWeight: 600, color: "var(--neo-accent)",
              }}>Tempel</button>
            </div>
          </div>
        </div>

        {phrase.trim().length > 0 && (
          <p style={{
            fontSize: 13, marginBottom: 12,
            color: isValid ? "var(--neo-accent)" : "var(--neo-muted)",
          }}>
            {wc} dari {wc > 12 ? 24 : 12} kata
          </p>
        )}

        {error && (
          <p style={{ fontSize: 13, color: "var(--neo-error)", marginBottom: 12 }}>{error}</p>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 24px 34px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <button className="neo-btn" disabled={!isValid || loading} onClick={handleImport}
          style={{
            background: isValid ? "var(--neo-accent)" : "#E8E8EC",
            color: isValid ? "#fff" : "var(--neo-muted)",
          }}>
          {loading ? "Mengimpor..." : "Impor Akun"}
        </button>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 340, borderRadius: 20, padding: 24,
            background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-lg)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Impor vs Buat Akun Baru</span>
              <button onClick={() => setShowInfo(false)} style={{ display: "flex" }}>
                {Ico.close("var(--neo-muted)")}
              </button>
            </div>
            <p style={{ fontSize: 14, color: "var(--neo-muted)", lineHeight: "22px", marginBottom: 20 }}>
              Mengimpor akun memungkinkan Anda menambahkan akun dari frasa pemulihan lain ke dalam dompet ini.
              Akun yang diimpor tidak terhubung dengan frasa pemulihan utama dompet ini.
            </p>
            <button onClick={() => setShowInfo(false)} className="neo-btn" style={{
              background: "var(--neo-accent)", color: "#fff", height: 48,
            }}>Mengerti</button>
          </div>
        </div>
      )}
    </div>
  );
}
