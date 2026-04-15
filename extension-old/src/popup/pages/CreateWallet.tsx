import { useState } from "react";
import { generateMnemonic, validateMnemonic } from "@/crypto/wallet";

type Step = "show" | "quiz" | "password";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

/* ── Create Wallet ───────────────────────────────────────────────────────── */
export function CreateWallet({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep]     = useState<Step>("show");
  const [mnemonic]          = useState(() => generateMnemonic());
  const [saved, setSaved]   = useState(false);
  const [blurred, setBlurred] = useState(true);
  const [copied, setCopied] = useState(false);

  const words = mnemonic.split(" ");

  function copy() {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (step === "quiz") return <QuizStep words={words} onBack={() => setStep("show")} onDone={() => setStep("password")} />;
  if (step === "password") return <PasswordStep mnemonic={mnemonic} onBack={() => setStep("quiz")} onDone={onDone} />;

  return (
    <div className="mm-page">
      <div className="mm-page-header">
        <button className="mm-back" onClick={onBack}>←</button>
        <span className="mm-page-title">Secret Recovery Phrase</span>
      </div>

      {/* Warning — persis seperti MetaMask */}
      <div className="mm-banner mm-banner-warn">
        <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
        <div>
          <strong>Jangan bagikan ke siapapun!</strong>
          <br />Simpan 24 kata ini di tempat yang aman. Siapa saja yang memilikinya dapat mengakses semua dana Anda.
        </div>
      </div>

      {/* Seed phrase chip grid — 6 kolom × 4 baris */}
      <div style={{ position:"relative" }}>
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(4, 1fr)",
          gap:6,
          filter: blurred ? "blur(5px)" : "none",
          userSelect: blurred ? "none" : "auto",
          transition:"filter .3s",
        }}>
          {words.map((w, i) => (
            <div key={i} style={{
              background:"var(--bg)", border:"1.5px solid var(--border-2)",
              borderRadius:"var(--r-sm)", padding:"6px 8px",
              display:"flex", alignItems:"center", gap:5,
              boxShadow:"var(--s-sm)",
            }}>
              <span style={{ fontSize:9, color:"var(--t3)", fontWeight:700, minWidth:14, lineHeight:1 }}>{i+1}</span>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--t1)" }}>{w}</span>
            </div>
          ))}
        </div>

        {/* Blur overlay */}
        {blurred && (
          <div style={{
            position:"absolute", inset:0,
            display:"flex", alignItems:"center", justifyContent:"center",
            borderRadius:"var(--r-md)",
          }}>
            <button
              onClick={() => setBlurred(false)}
              className="mm-btn mm-btn-ghost mm-btn-sm"
              style={{ gap:6, padding:"10px 20px" }}
            >
              👁 Tampilkan Seed Phrase
            </button>
          </div>
        )}
      </div>

      {/* Copy button */}
      {!blurred && (
        <button onClick={copy} style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          padding:"9px 16px", borderRadius:"var(--r-sm)",
          border:"1.5px dashed var(--border)", color:"var(--t2)",
          fontSize:13, fontWeight:500, width:"100%",
          background:"var(--bg)",
        }}>
          {copied ? "✓ Tersalin!" : "📋 Salin Seed Phrase"}
        </button>
      )}

      <div className="mm-footer">
        <label style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer", padding:"4px 0" }}>
          <input
            type="checkbox" checked={saved}
            onChange={e => setSaved(e.target.checked)}
            style={{ marginTop:2, accentColor:"var(--primary)", width:16, height:16, cursor:"pointer", flexShrink:0 }}
          />
          <span style={{ fontSize:13, color:"var(--t2)", lineHeight:1.5 }}>
            Saya sudah menyimpan seed phrase ini di tempat yang aman
          </span>
        </label>
        <button
          className="mm-btn mm-btn-primary"
          disabled={!saved || blurred}
          onClick={() => setStep("quiz")}
        >
          Lanjutkan →
        </button>
      </div>
    </div>
  );
}

/* ── Quiz Step — verifikasi seperti MetaMask ─────────────────────────────── */
function QuizStep({ words, onBack, onDone }: {
  words: string[]; onBack: () => void; onDone: () => void;
}) {
  const [indices] = useState<number[]>(() => {
    const pool = [...Array(words.length).keys()];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 4).sort((a, b) => a - b);
  });
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError]     = useState("");

  function check() {
    for (const i of indices) {
      if ((answers[i] || "").trim().toLowerCase() !== words[i].toLowerCase()) {
        setError(`Kata ke-${i + 1} salah. Periksa seed phrase Anda.`);
        return;
      }
    }
    onDone();
  }

  const allFilled = indices.every(i => (answers[i] || "").trim());

  return (
    <div className="mm-page">
      <div className="mm-page-header">
        <button className="mm-back" onClick={onBack}>←</button>
        <span className="mm-page-title">Konfirmasi Seed Phrase</span>
      </div>

      <div className="mm-banner mm-banner-success">
        <span style={{ fontSize:16 }}>✍️</span>
        <span>
          Masukkan kata ke-<strong>{indices.map(i => i + 1).join(", ")}</strong> dari seed phrase Anda.
        </span>
      </div>

      {/* Show all words — blank out quiz indices */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6 }}>
        {words.map((w, i) => {
          const isQuiz = indices.includes(i);
          return (
            <div key={i} style={{
              background: isQuiz ? "var(--primary-bg)" : "var(--bg-alt)",
              border: `1.5px solid ${isQuiz ? "var(--primary)" : "var(--border-2)"}`,
              borderRadius:"var(--r-sm)", padding:"5px 7px",
              display:"flex", alignItems:"center", gap:4,
            }}>
              <span style={{ fontSize:9, color:"var(--t3)", fontWeight:700, minWidth:14 }}>{i+1}</span>
              {isQuiz
                ? <input
                    type="text"
                    value={answers[i] || ""}
                    onChange={e => { setError(""); setAnswers(p => ({ ...p, [i]: e.target.value })); }}
                    placeholder="..."
                    autoComplete="off" spellCheck={false}
                    style={{
                      border:"none", outline:"none", background:"transparent",
                      width:"100%", fontSize:11, fontWeight:600,
                      color:"var(--primary)", padding:0,
                    }}
                  />
                : <span style={{ fontSize:11, fontWeight:600, color:"var(--t2)" }}>{w}</span>
              }
            </div>
          );
        })}
      </div>

      {error && (
        <p style={{ fontSize:12, color:"var(--error)", fontWeight:500, display:"flex", alignItems:"center", gap:6 }}>
          ❌ {error}
        </p>
      )}

      <div className="mm-footer">
        <button className="mm-btn mm-btn-primary" disabled={!allFilled} onClick={check}>
          Konfirmasi
        </button>
      </div>
    </div>
  );
}

/* ── Password Step ───────────────────────────────────────────────────────── */
function PasswordStep({ mnemonic, onBack, onDone }: {
  mnemonic: string; onBack: () => void; onDone: () => void;
}) {
  const [pw, setPw]     = useState("");
  const [cw, setCw]     = useState("");
  const [err, setErr]   = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed]   = useState(false);

  const strength =
    pw.length === 0 ? 0 :
    pw.length < 8   ? 1 :
    pw.length < 12  ? 2 : 3;
  const sColors = ["var(--border-2)", "var(--error)", "var(--warning)", "var(--success)"];
  const sLabels = ["", "Lemah", "Cukup", "Kuat"];

  async function create() {
    if (pw.length < 8)  { setErr("Password minimal 8 karakter"); return; }
    if (pw !== cw)      { setErr("Password tidak cocok"); return; }
    if (!agreed)        { setErr("Harap setujui syarat penggunaan"); return; }
    setErr(""); setLoading(true);
    const r = await msg("wallet_create", { mnemonic, password: pw });
    setLoading(false);
    if (r?.result?.address) onDone();
    else setErr(r?.error || "Gagal membuat wallet");
  }

  return (
    <div className="mm-page">
      <div className="mm-page-header">
        <button className="mm-back" onClick={onBack}>←</button>
        <span className="mm-page-title">Buat Password</span>
      </div>

      <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6 }}>
        Password ini mengenkripsi wallet di browser Anda. Tidak dapat dipulihkan — simpan dengan baik.
      </p>

      <div className="mm-body">
        {/* Password */}
        <div className="mm-field">
          <label className="mm-label">Password Baru</label>
          <input className="mm-input" type="password" placeholder="Min. 8 karakter"
            value={pw} onChange={e => { setErr(""); setPw(e.target.value); }} />

          {/* Strength meter — persis MetaMask */}
          {pw.length > 0 && (
            <div>
              <div className="pw-strength">
                {[1,2,3].map(n => (
                  <div key={n} className="pw-strength-bar"
                    style={{ background: strength >= n ? sColors[strength] : "var(--border-2)" }} />
                ))}
              </div>
              <p style={{ fontSize:11, color: sColors[strength], fontWeight:600, marginTop:4 }}>
                Kekuatan: {sLabels[strength]}
              </p>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div className="mm-field">
          <label className="mm-label">Konfirmasi Password</label>
          <input className="mm-input" type="password" placeholder="Ulangi password"
            value={cw} onChange={e => { setErr(""); setCw(e.target.value); }}
            onKeyDown={e => e.key === "Enter" && create()} />
          {cw && pw !== cw && <span className="mm-error">Password tidak cocok</span>}
          {cw && pw === cw && cw.length > 0 && <span style={{ fontSize:11, color:"var(--success)", fontWeight:500 }}>✓ Cocok</span>}
        </div>

        {/* Agree checkbox */}
        <label style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop:2, accentColor:"var(--primary)", width:15, height:15, cursor:"pointer", flexShrink:0 }} />
          <span style={{ fontSize:12, color:"var(--t2)", lineHeight:1.5 }}>
            Saya mengerti bahwa GarudaChain tidak dapat memulihkan password ini jika saya lupa.
          </span>
        </label>

        {err && <p style={{ fontSize:12, color:"var(--error)", fontWeight:500 }}>❌ {err}</p>}
      </div>

      <div className="mm-footer">
        <button className="mm-btn mm-btn-primary" disabled={loading || !pw || !cw || !agreed} onClick={create}>
          {loading ? "Membuat wallet..." : "🚀 Buat Wallet"}
        </button>
      </div>
    </div>
  );
}

/* ── Import Wallet ───────────────────────────────────────────────────────── */
export function ImportWallet({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [pw, setPw]         = useState("");
  const [cw, setCw]         = useState("");
  const [err, setErr]       = useState("");
  const [loading, setLoading] = useState(false);

  const wc      = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;
  const isValid = validateMnemonic(phrase.trim().toLowerCase());

  async function doImport() {
    const clean = phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!isValid)        { setErr("Seed phrase tidak valid — butuh tepat 24 kata"); return; }
    if (pw.length < 8)   { setErr("Password minimal 8 karakter"); return; }
    if (pw !== cw)       { setErr("Password tidak cocok"); return; }
    setErr(""); setLoading(true);
    const r = await msg("wallet_create", { mnemonic: clean, password: pw });
    setLoading(false);
    if (r?.result?.address) onDone();
    else setErr(r?.error || "Gagal mengimpor wallet");
  }

  return (
    <div className="mm-page">
      <div className="mm-page-header">
        <button className="mm-back" onClick={onBack}>←</button>
        <span className="mm-page-title">Impor Wallet</span>
      </div>

      <div className="mm-banner mm-banner-warn">
        <span style={{ fontSize:16, flexShrink:0 }}>🔑</span>
        <span>Masukkan 24 kata seed phrase dari garuda-qt atau wallet GarudaChain lainnya.</span>
      </div>

      <div className="mm-body">
        {/* SRP input */}
        <div className="mm-field">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <label className="mm-label">Secret Recovery Phrase</label>
            <span style={{
              fontSize:11, fontWeight:700, padding:"2px 8px",
              borderRadius:"var(--r-pill)",
              background: isValid ? "var(--success-bg)" : wc > 0 ? "var(--error-bg)" : "var(--bg-alt)",
              color: isValid ? "var(--success)" : wc > 0 ? "var(--error)" : "var(--t3)",
            }}>{wc}/24</span>
          </div>
          <textarea className="mm-textarea" rows={4}
            value={phrase}
            onChange={e => { setErr(""); setPhrase(e.target.value); }}
            placeholder="Ketik atau tempel seed phrase (24 kata)..."
            autoComplete="off" spellCheck={false}
          />
          {isValid && <span style={{ fontSize:11, color:"var(--success)", fontWeight:600 }}>✓ Seed phrase valid</span>}
        </div>

        <div className="mm-field">
          <label className="mm-label">Password Baru</label>
          <input className="mm-input" type="password" placeholder="Min. 8 karakter"
            value={pw} onChange={e => { setErr(""); setPw(e.target.value); }} />
        </div>

        <div className="mm-field">
          <label className="mm-label">Konfirmasi Password</label>
          <input className="mm-input" type="password" placeholder="Ulangi password"
            value={cw} onChange={e => { setErr(""); setCw(e.target.value); }}
            onKeyDown={e => e.key === "Enter" && doImport()} />
        </div>

        {err && <p style={{ fontSize:12, color:"var(--error)", fontWeight:500 }}>❌ {err}</p>}
      </div>

      <div className="mm-footer">
        <button className="mm-btn mm-btn-primary" disabled={loading || !isValid || !pw || !cw} onClick={doImport}>
          {loading ? "Mengimpor..." : "Impor Wallet"}
        </button>
      </div>
    </div>
  );
}
