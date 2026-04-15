import { useState } from "react";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

const Ico = {
  back: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M328 112L184 256l144 144" />
    </svg>
  ),
  eye: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 000-17.47C428.89 172.28 347.8 112 255.66 112z" />
      <circle cx="256" cy="256" r="80" />
    </svg>
  ),
  eyeOff: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M432 448l-368-384" /><path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77c15.85 26.08 39.11 54.52 63.11 76.33" />
    </svg>
  ),
  warning: (c = "currentColor", s = 18) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M85.57 446.25h340.86a32 32 0 0028.17-47.17L284.18 82.58c-12.09-22.44-44.27-22.44-56.36 0L57.4 399.08a32 32 0 0028.17 47.17z" />
      <path d="M256 232v80" /><circle cx="256" cy="352" r="8" fill={c} />
    </svg>
  ),
};

export function ImportKunciPrivat({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [privateKey, setPrivateKey] = useState("");
  const [name, setName] = useState("Akun Impor");
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  const isValid = /^[0-9a-fA-F]{64}$/.test(privateKey.trim());

  async function handleImport() {
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
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
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <button onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 12, background: "var(--neo-bg)",
          boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>{Ico.back("var(--neo-text)")}</button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Impor Kunci Privat</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {/* Warning */}
        <div style={{
          display: "flex", gap: 10, padding: 14, borderRadius: 12, marginBottom: 20,
          background: "#FFF8E7", border: "1px solid #F0C040",
        }}>
          <span style={{ flexShrink: 0, display: "flex" }}>{Ico.warning("#C8922A")}</span>
          <p style={{ flex: 1, fontSize: 13, color: "#92610A", lineHeight: "19px" }}>
            Jangan pernah bagikan kunci privat Anda kepada siapa pun. Siapa pun yang memiliki kunci ini dapat mengakses seluruh aset Anda.
          </p>
        </div>

        {/* Account Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>
            Nama Akun
          </label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama akun"
            style={{ height: 48, borderRadius: 12, boxShadow: "var(--neo-inset-sm)" }} />
        </div>

        {/* Private Key */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>
            Kunci Privat (64 karakter hex)
          </label>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            borderRadius: 14, padding: "0 14px", height: 56,
            background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
            border: `1.5px solid ${privateKey && !isValid ? "#EF4444" : privateKey ? "var(--neo-accent)" : "var(--neo-border)"}`,
          }}>
            <input
              type={showKey ? "text" : "password"}
              value={privateKey}
              onChange={e => { setPrivateKey(e.target.value); setError(""); }}
              placeholder="Masukkan kunci privat hex..."
              autoComplete="off" spellCheck={false}
              style={{
                flex: 1, border: "none", background: "transparent",
                boxShadow: "none", padding: 0, fontSize: 14, outline: "none",
                fontFamily: "monospace",
              }}
            />
            <button onClick={() => setShowKey(!showKey)} style={{ display: "flex", color: "var(--neo-muted)" }}>
              {showKey ? Ico.eyeOff("var(--neo-muted)") : Ico.eye("var(--neo-muted)")}
            </button>
          </div>
          {privateKey && !isValid && (
            <p style={{ fontSize: 12, color: "var(--neo-muted)", marginTop: 6 }}>
              {privateKey.trim().length}/64 karakter
            </p>
          )}
        </div>

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
    </div>
  );
}
