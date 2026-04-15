import { useState, useMemo } from "react";
import { generateMnemonic, validateMnemonic } from "@/crypto/wallet";

type Step = "password" | "show" | "verify" | "done";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

/* ── Create Wallet — sama persis mobile flow ─────────────────────────────── */
export function CreateWallet({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>("password");
  const [mnemonic, setMnemonic] = useState("");
  const [password, setPassword] = useState("");

  if (step === "password") return (
    <PasswordStep
      onBack={onBack}
      onDone={(pw) => {
        setPassword(pw);
        setMnemonic(generateMnemonic());
        setStep("show");
      }}
    />
  );
  if (step === "show") return (
    <ShowPhrase mnemonic={mnemonic} onBack={() => setStep("password")} onDone={() => setStep("verify")} />
  );
  if (step === "verify") return (
    <VerifyPhrase mnemonic={mnemonic} password={password} onBack={() => setStep("show")} onDone={onDone} />
  );
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Password Step — sama mobile buat-kata-sandi.tsx
   ═══════════════════════════════════════════════════════════════════════════ */
function PasswordStep({ onBack, onDone }: { onBack: () => void; onDone: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [cw, setCw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCw, setShowCw] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const isValid = pw.length >= 8 && pw === cw && agreed;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"var(--neo-bg)" }}>
      <div style={{ padding:"8px 16px" }}>
        <button onClick={onBack} style={{
          width:42, height:42, borderRadius:21,
          background:"var(--neo-bg)", boxShadow:"var(--neo-shadow-sm)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, color:"var(--neo-text)",
        }}>←</button>
      </div>

      <div style={{ flex:1, padding:"0 24px", overflowY:"auto" }}>
        <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-.5px", color:"var(--neo-text)", marginBottom:8 }}>
          Kata sandi Dompet Digital
        </h1>
        <p style={{ fontSize:14, color:"var(--neo-muted)", lineHeight:"20px", marginBottom:32 }}>
          Buka Dompet Digital hanya pada perangkat ini.
        </p>

        {/* Password */}
        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:14, fontWeight:600, color:"var(--neo-text)", display:"block", marginBottom:8 }}>
            Buat kata sandi
          </label>
          <div style={{
            display:"flex", alignItems:"center", gap:12,
            background:"var(--neo-bg)", borderRadius:14, padding:"0 16px", height:56,
            boxShadow:"var(--neo-inset)",
          }}>
            <input type={showPw ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)}
              placeholder="" autoComplete="off"
              style={{ flex:1, border:"none", background:"transparent", boxShadow:"none", padding:0, fontSize:16 }} />
            <button onClick={() => setShowPw(!showPw)} style={{ fontSize:18, color:"var(--neo-muted)" }}>
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
          <p style={{ fontSize:12, color:"var(--neo-muted)", marginTop:6 }}>Minimal berisi 8 karakter</p>
        </div>

        {/* Confirm */}
        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:14, fontWeight:600, color:"var(--neo-text)", display:"block", marginBottom:8 }}>
            Konfirmasikan kata sandi
          </label>
          <div style={{
            display:"flex", alignItems:"center", gap:12,
            background:"var(--neo-bg)", borderRadius:14, padding:"0 16px", height:56,
            boxShadow:"var(--neo-inset)",
            outline: cw.length > 0 && cw !== pw ? "2px solid var(--neo-error)" : "none",
          }}>
            <input type={showCw ? "text" : "password"} value={cw} onChange={e => setCw(e.target.value)}
              placeholder="" autoComplete="off"
              style={{ flex:1, border:"none", background:"transparent", boxShadow:"none", padding:0, fontSize:16 }} />
            <button onClick={() => setShowCw(!showCw)} style={{ fontSize:18, color:"var(--neo-muted)" }}>
              {showCw ? "🙈" : "👁"}
            </button>
          </div>
          {cw.length > 0 && cw !== pw && (
            <p style={{ fontSize:12, color:"var(--neo-error)", marginTop:6 }}>Kata sandi tidak cocok</p>
          )}
        </div>

        {/* Checkbox */}
        <div onClick={() => setAgreed(!agreed)} style={{
          display:"flex", alignItems:"flex-start", gap:12,
          background:"var(--neo-bg)", borderRadius:14, padding:16, cursor:"pointer",
          boxShadow:"var(--neo-inset-sm)",
        }}>
          <div style={{
            width:22, height:22, borderRadius:6, flexShrink:0, marginTop:1,
            border: `1.5px solid ${agreed ? "var(--neo-accent)" : "var(--neo-border)"}`,
            background: agreed ? "var(--neo-accent)" : "transparent",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:14, fontWeight:700,
          }}>
            {agreed && "✓"}
          </div>
          <p style={{ fontSize:13, color:"var(--neo-muted)", lineHeight:"19px" }}>
            Jika saya kehilangan kata sandi ini, Dompet Digital tidak dapat meresetnya.{" "}
            <span style={{ color:"var(--neo-accent)" }}>Pelajari selengkapnya</span>
          </p>
        </div>
      </div>

      <div style={{ padding:"16px 24px 34px" }}>
        <button className="neo-btn" disabled={!isValid} onClick={() => isValid && onDone(pw)}
          style={{ background: isValid ? "var(--neo-accent)" : "#E8E8EC", color: isValid ? "#fff" : "var(--neo-muted)" }}>
          Buat kata sandi
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Show Phrase — sama mobile frasa-pemulihan.tsx
   ═══════════════════════════════════════════════════════════════════════════ */
function ShowPhrase({ mnemonic, onBack, onDone }: { mnemonic: string; onBack: () => void; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = mnemonic.split(" ");

  function copy() {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"var(--neo-bg)" }}>
      <div style={{ padding:"8px 16px" }}>
        <button onClick={onBack} style={{ width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"var(--neo-text)" }}>←</button>
      </div>

      <div style={{ flex:1, padding:"0 24px", overflowY:"auto" }}>
        <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-.5px", color:"var(--neo-text)", lineHeight:"34px", marginBottom:16 }}>
          Simpan Frasa Pemulihan{"\n"}Rahasia
        </h1>
        <p style={{ fontSize:14, color:"var(--neo-muted)", lineHeight:"21px", marginBottom:24 }}>
          <span style={{ color:"var(--neo-accent)", fontWeight:600, cursor:"pointer" }}>Frasa Pemulihan Rahasia</span>{" "}
          memberikan akses dompet sepenuhnya. Catat dengan urutan dan nomor yang benar.
          {"\n"}Simpan dengan aman dan jangan pernah dibagikan.
        </p>

        {/* 3-column grid */}
        <div style={{ position:"relative", borderRadius:16, overflow:"hidden", marginBottom:16, background:"var(--neo-bg)", boxShadow:"var(--neo-shadow)" }}>
          <div style={{ display:"flex", flexWrap:"wrap" }}>
            {words.map((w, i) => (
              <div key={i} style={{ width:"33.33%", display:"flex", alignItems:"center", gap:4, padding:"14px 10px", borderBottom:"1px solid rgba(0,0,0,0.05)" }}>
                <span style={{ fontSize:12, fontWeight:500, color:"var(--neo-muted)", minWidth:22 }}>{i+1}.</span>
                <span style={{ fontSize:14, fontWeight:500, color:"var(--neo-text)" }}>{w}</span>
              </div>
            ))}
          </div>
          {!revealed && (
            <div onClick={() => setRevealed(true)} style={{
              position:"absolute", inset:0, cursor:"pointer",
              background:"rgba(240,240,240,0.85)", backdropFilter:"blur(12px)",
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10,
            }}>
              <span style={{ fontSize:28 }}>🙈</span>
              <span style={{ fontSize:17, fontWeight:600, color:"var(--neo-text)" }}>Ketuk untuk melihat</span>
              <span style={{ fontSize:13, color:"var(--neo-muted)", textAlign:"center" }}>Pastikan tidak ada yang melihat layar Anda.</span>
            </div>
          )}
        </div>

        {revealed && (
          <button onClick={copy} style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            width:"100%", height:48, borderRadius:12, marginBottom:16,
            border: `1.5px solid ${copied ? "var(--neo-accent)" : "var(--neo-border)"}`,
            background: copied ? "#FFF8E7" : "var(--neo-bg)", fontSize:14, fontWeight:500,
            color: copied ? "var(--neo-accent)" : "var(--neo-muted)",
          }}>
            {copied ? "✓ Tersalin!" : "📋 Salin ke papan klip"}
          </button>
        )}

        <div style={{ display:"flex", gap:10, padding:14, borderRadius:12, background:"#FFF8E7", border:"1px solid #F0C040", alignItems:"flex-start" }}>
          <span style={{ fontSize:18, color:"var(--neo-accent)", marginTop:1 }}>⚠️</span>
          <p style={{ flex:1, fontSize:13, color:"#7A5A00", lineHeight:"19px" }}>
            Jangan pernah bagikan frasa ini kepada siapapun. Siapapun yang memiliki frasa ini dapat mengakses seluruh aset Anda.
          </p>
        </div>
      </div>

      <div style={{ padding:"16px 24px 34px", borderTop:"1px solid rgba(0,0,0,0.06)", display:"flex", flexDirection:"column", gap:12 }}>
        <button className="neo-btn" disabled={!revealed} onClick={() => revealed && onDone()}
          style={{ background: revealed ? "var(--neo-accent)" : "#E8E8EC", color: revealed ? "#fff" : "var(--neo-muted)" }}>
          Lanjutkan
        </button>
        <button onClick={onBack} style={{ height:44, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:600, color:"var(--neo-accent)" }}>
          Ingatkan saya nanti
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Verify Phrase — sama mobile verifikasi-frasa.tsx
   PILIH kata (bukan ketik) — 6 quiz, 3 choices per question
   ═══════════════════════════════════════════════════════════════════════════ */
function pickQuizIndices(): number[] {
  const all = Array.from({ length: 24 }, (_, i) => i);
  const shuffled = all.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 6).sort((a, b) => a - b);
}

function getChoices(correctWord: string, allWords: string[]): string[] {
  const pool = allWords.filter(w => w !== correctWord);
  const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 2);
  return [correctWord, ...wrong].sort(() => Math.random() - 0.5);
}

function VerifyPhrase({ mnemonic, password, onBack, onDone }: {
  mnemonic: string; password: string; onBack: () => void; onDone: () => void;
}) {
  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  const quizIndices = useMemo(() => pickQuizIndices(), []);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeQuizIndex = quizIndices.find(idx => answers[idx] === undefined) ?? null;

  const currentChoices = useMemo(() => {
    if (activeQuizIndex === null || words.length === 0) return [];
    return getChoices(words[activeQuizIndex], words);
  }, [activeQuizIndex, words]);

  const allAnswered = quizIndices.every(idx => answers[idx] !== undefined);

  function handleChoice(word: string) {
    if (activeQuizIndex === null) return;
    if (word === words[activeQuizIndex]) {
      const newAnswers = { ...answers, [activeQuizIndex]: word };
      setAnswers(newAnswers);
      if (quizIndices.every(idx => newAnswers[idx] !== undefined)) {
        setShowSuccess(true);
      }
    } else {
      setWrongFlash(word);
      setTimeout(() => setWrongFlash(null), 600);
    }
  }

  async function handleCreate() {
    setLoading(true); setError("");
    const r = await msg("wallet_create", { mnemonic, password });
    setLoading(false);
    if (r?.result?.address) onDone();
    else setError(r?.error || "Gagal membuat wallet");
  }

  // Success modal
  if (showSuccess && !loading) {
    return (
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        height:600, background:"rgba(0,0,0,0.55)", padding:32,
      }}>
        <div style={{
          width:"100%", maxWidth:340, borderRadius:24, padding:28,
          background:"var(--neo-bg)", display:"flex", flexDirection:"column", alignItems:"center",
          boxShadow:"var(--neo-shadow-lg)",
        }}>
          <span style={{ fontSize:64, marginBottom:16 }}>✅</span>
          <h2 style={{ fontSize:24, fontWeight:700, color:"var(--neo-text)", marginBottom:12, textAlign:"center" }}>Sempurna!</h2>
          <p style={{ fontSize:14, color:"var(--neo-muted)", lineHeight:"22px", textAlign:"center", marginBottom:24 }}>
            Frasa pemulihan kamu berhasil diverifikasi. Jangan pernah membagikan frasa ini kepada siapa pun, termasuk tim dukungan kami.
          </p>
          {error && <p style={{ fontSize:13, color:"var(--neo-error)", marginBottom:12 }}>{error}</p>}
          <button className="neo-btn" onClick={handleCreate} disabled={loading}
            style={{ background:"#22c55e", color:"#fff", width:"100%" }}>
            {loading ? "Membuat dompet..." : "Mengerti"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"var(--neo-bg)" }}>
      <div style={{ padding:"8px 16px" }}>
        <button onClick={onBack} style={{ width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"var(--neo-text)" }}>←</button>
      </div>

      <div style={{ flex:1, padding:"0 24px", overflowY:"auto" }}>
        <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-.5px", color:"var(--neo-text)", lineHeight:"34px", marginBottom:12 }}>
          Konfirmasi Frasa{"\n"}Pemulihan Rahasia
        </h1>
        <p style={{ fontSize:14, color:"var(--neo-muted)", lineHeight:"20px", marginBottom:24 }}>
          Pilih kata yang hilang dalam urutan yang benar.
        </p>

        {/* Word grid — 3 columns like mobile */}
        <div style={{ borderRadius:16, overflow:"hidden", background:"var(--neo-bg)", boxShadow:"var(--neo-shadow)" }}>
          <div style={{ display:"flex", flexWrap:"wrap" }}>
            {words.map((word, index) => {
              const isQuiz = quizIndices.includes(index);
              const isActive = index === activeQuizIndex;
              const isAnswered = answers[index] !== undefined;

              let bg = "transparent";
              let borderColor = "rgba(0,0,0,0.05)";
              if (isActive) { bg = "var(--neo-bg)"; borderColor = "var(--neo-accent)"; }
              else if (isAnswered) { bg = "#C8922A"; borderColor = "#C8922A"; }

              return (
                <div key={index} style={{
                  width:"33.33%", display:"flex", alignItems:"center", gap:4,
                  padding:"14px 10px", borderBottom:`1px solid ${borderColor}`,
                  background: bg,
                  ...(isActive ? { outline:"2px solid var(--neo-accent)", outlineOffset:"-2px", borderRadius:0 } : {}),
                }}>
                  <span style={{
                    fontSize:12, fontWeight:500, minWidth:22,
                    color: isAnswered ? "rgba(255,255,255,0.45)" : "var(--neo-muted)",
                  }}>{index+1}.</span>

                  {isAnswered ? (
                    <span style={{ fontSize:13, fontWeight:500, color:"#fff" }}>{answers[index]}</span>
                  ) : isQuiz ? (
                    <span style={{ fontSize:13, color: isActive ? "var(--neo-text)" : "var(--neo-muted)", letterSpacing:1 }}>
                      {isActive ? "" : "•••"}
                    </span>
                  ) : (
                    <span style={{ fontSize:13, color:"var(--neo-border)", letterSpacing:1 }}>
                      {"•".repeat(Math.min(word.length, 7))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer — choice chips + continue button */}
      <div style={{ padding:"16px 24px 34px", borderTop:"1px solid rgba(0,0,0,0.06)", display:"flex", flexDirection:"column", gap:16 }}>
        {/* Choice chips — 3 buttons */}
        {!allAnswered && activeQuizIndex !== null && (
          <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
            {currentChoices.map(choice => {
              const isWrong = wrongFlash === choice;
              return (
                <button key={choice} onClick={() => handleChoice(choice)} style={{
                  flex:1, height:46, borderRadius:24,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  background: isWrong ? "#fff0f0" : "var(--neo-bg)",
                  boxShadow: isWrong ? "none" : "4px 4px 10px #D1D5DD, -4px -4px 10px #FFFFFF",
                  border: isWrong ? "2px solid #ef4444" : "none",
                  fontSize:15, fontWeight:600,
                  color: isWrong ? "#ef4444" : "var(--neo-accent)",
                  transition:"all .15s",
                }}>
                  {choice}
                </button>
              );
            })}
          </div>
        )}

        <button className="neo-btn" disabled={!allAnswered}
          style={{ background: allAnswered ? "var(--neo-accent)" : "#E8E8EC", color: allAnswered ? "#fff" : "var(--neo-muted)" }}>
          Lanjutkan
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Import Wallet — sama mobile impor-dompet.tsx
   ═══════════════════════════════════════════════════════════════════════════ */
export function ImportWallet({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [pw, setPw] = useState("");
  const [cw, setCw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"phrase"|"password">("phrase");

  const wc = phrase.trim() === "" ? 0 : phrase.trim().split(/\s+/).length;
  const isValid = wc === 24 && validateMnemonic(phrase.trim().toLowerCase());

  async function doImport() {
    if (pw.length < 8) { setError("Password minimal 8 karakter"); return; }
    if (pw !== cw) { setError("Kata sandi tidak cocok"); return; }
    setError(""); setLoading(true);
    const clean = phrase.trim().toLowerCase().replace(/\s+/g, " ");
    const r = await msg("wallet_create", { mnemonic: clean, password: pw });
    setLoading(false);
    if (r?.result?.address) onDone();
    else setError(r?.error || "Gagal mengimpor dompet");
  }

  // Step 1: Enter phrase
  if (step === "phrase") return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"var(--neo-bg)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px" }}>
        <button onClick={onBack} style={{ width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"var(--neo-text)" }}>←</button>
      </div>
      <div style={{ flex:1, padding:"0 24px 0", overflowY:"auto" }}>
        <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-.5px", color:"var(--neo-text)", marginBottom:8 }}>Impor dompet</h1>
        <p style={{ fontSize:14, color:"var(--neo-muted)", marginBottom:20 }}>Masukkan Frasa Pemulihan Rahasia</p>
        <div style={{
          borderRadius:16, padding:16, minHeight:160,
          border: `1.5px solid ${phrase.length > 0 ? "var(--neo-accent)" : "var(--neo-border)"}`,
          background:"var(--neo-bg)",
        }}>
          <textarea value={phrase} onChange={e => { setError(""); setPhrase(e.target.value); }}
            placeholder="Tambahkan spasi di antara setiap kata dan pastikan tidak ada yang melihat."
            autoComplete="off" spellCheck={false}
            style={{ width:"100%", minHeight:100, border:"none", background:"transparent", boxShadow:"none", padding:0, fontSize:15, lineHeight:"22px", resize:"none", outline:"none", color:"var(--neo-text)" }} />
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12 }}>
            <button onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setPhrase(t); } catch {} }}
              style={{ fontSize:15, fontWeight:600, color:"var(--neo-accent)" }}>
              Tempel
            </button>
          </div>
        </div>
        {phrase.trim().length > 0 && (
          <p style={{ fontSize:13, marginTop:10, color: isValid ? "var(--neo-accent)" : "var(--neo-muted)" }}>
            {wc} dari 24 kata
          </p>
        )}
      </div>
      <div style={{ padding:"16px 24px 34px", borderTop:"1px solid rgba(0,0,0,0.06)" }}>
        <button className="neo-btn" disabled={!isValid} onClick={() => isValid && setStep("password")}
          style={{ background: isValid ? "var(--neo-accent)" : "#E8E8EC", color: isValid ? "#fff" : "var(--neo-muted)" }}>
          Lanjutkan
        </button>
      </div>
    </div>
  );

  // Step 2: Set password — sama mobile set-password-only.tsx (2 input + confirm)
  return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"var(--neo-bg)" }}>
      <div style={{ padding:"8px 16px" }}>
        <button onClick={() => setStep("phrase")} style={{
          width:42, height:42, borderRadius:21,
          background:"var(--neo-bg)", boxShadow:"var(--neo-shadow-sm)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"var(--neo-text)",
        }}>←</button>
      </div>
      <div style={{ flex:1, padding:"0 24px" }}>
        <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-.5px", color:"var(--neo-text)", marginBottom:8 }}>Buat kata sandi</h1>
        <p style={{ fontSize:14, color:"var(--neo-muted)", lineHeight:"20px", marginBottom:32 }}>Password untuk mengenkripsi wallet di browser ini.</p>

        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:14, fontWeight:600, color:"var(--neo-text)", display:"block", marginBottom:8 }}>Kata sandi baru</label>
          <div style={{ display:"flex", alignItems:"center", background:"var(--neo-bg)", borderRadius:14, padding:"0 16px", height:56, boxShadow:"var(--neo-inset)" }}>
            <input type="password" value={pw} onChange={e => { setError(""); setPw(e.target.value); }} placeholder="Min. 8 karakter" autoComplete="off"
              style={{ flex:1, border:"none", background:"transparent", boxShadow:"none", padding:0, fontSize:16 }} />
          </div>
          <p style={{ fontSize:12, color:"var(--neo-muted)", marginTop:6 }}>Minimal berisi 8 karakter</p>
        </div>

        <div style={{ marginBottom:24 }}>
          <label style={{ fontSize:14, fontWeight:600, color:"var(--neo-text)", display:"block", marginBottom:8 }}>Konfirmasi kata sandi</label>
          <div style={{
            display:"flex", alignItems:"center", background:"var(--neo-bg)", borderRadius:14, padding:"0 16px", height:56, boxShadow:"var(--neo-inset)",
            outline: cw.length > 0 && cw !== pw ? "2px solid var(--neo-error)" : "none",
          }}>
            <input type="password" value={cw} onChange={e => { setError(""); setCw(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && doImport()} placeholder="Ulangi kata sandi" autoComplete="off"
              style={{ flex:1, border:"none", background:"transparent", boxShadow:"none", padding:0, fontSize:16 }} />
          </div>
          {cw.length > 0 && cw !== pw && (
            <p style={{ fontSize:12, color:"var(--neo-error)", marginTop:6 }}>Kata sandi tidak cocok</p>
          )}
        </div>

        {error && <p style={{ fontSize:13, color:"var(--neo-error)", textAlign:"center" }}>{error}</p>}
      </div>
      <div style={{ padding:"16px 24px 34px", borderTop:"1px solid rgba(0,0,0,0.06)" }}>
        <button className="neo-btn" disabled={loading || pw.length < 8 || pw !== cw} onClick={doImport}
          style={{ background: pw.length >= 8 && pw === cw ? "var(--neo-accent)" : "#E8E8EC", color: pw.length >= 8 && pw === cw ? "#fff" : "var(--neo-muted)" }}>
          {loading ? "Mengimpor..." : "Impor Dompet"}
        </button>
      </div>
    </div>
  );
}
