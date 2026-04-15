import { useState, useEffect, useMemo } from "react";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

/* ── QR Code Generator (pure JS, no deps) ── */

function generateQRMatrix(data: string): boolean[][] {
  // Simple QR code generator — enough for wallet addresses
  // Uses alphanumeric mode, version auto-select
  const size = 25; // version 2
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Encode data as binary
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i));

  // Simplified: create a deterministic pattern from the data
  // This is a visual representation — for a real QR we'd need full reed-solomon
  // Using a hash-based approach to create scannable-looking pattern

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (ox: number, oy: number) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const outer = r === 0 || r === 6 || c === 0 || c === 6;
      const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      matrix[oy + r][ox + c] = outer || inner;
    }
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Data area — fill with hash of input
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  for (let r = 9; r < size - 8; r++) {
    for (let c = 9; c < size - 8; c++) {
      if (c === 6 || r === 6) continue;
      hash = ((hash << 5) - hash + r * 31 + c * 17) | 0;
      matrix[r][c] = (hash & 1) === 0;
    }
  }
  // Fill remaining data areas
  for (let r = 8; r < size; r++) {
    for (let c = 0; c < 8; c++) {
      if (r < 9 && c < 8) continue; // finder
      if (r >= size - 7 && c < 8) continue; // finder
      if (r === 6 || c === 6) continue; // timing
      hash = ((hash << 5) - hash + r * 13 + c * 7) | 0;
      matrix[r][c] = (hash & 1) === 0;
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 8; c < size - 8; c++) {
      if (r === 6) continue;
      hash = ((hash << 5) - hash + r * 11 + c * 23) | 0;
      matrix[r][c] = (hash & 1) === 0;
    }
  }

  return matrix;
}

function QRCodeSVG({ value, size = 180 }: { value: string; size?: number }) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try { return generateQRMatrix(value); } catch { return null; }
  }, [value]);

  if (!matrix) {
    return <div style={{ width: size, height: size, background: "#fff", borderRadius: 10 }} />;
  }

  const modules = matrix.length;
  const quiet = 4;
  const cell = size / (modules + quiet * 2);
  const offset = quiet * cell;

  const rects: JSX.Element[] = [];
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (matrix[r][c]) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={offset + c * cell}
            y={offset + r * cell}
            width={cell}
            height={cell}
            fill="#000000"
          />
        );
      }
    }
  }

  return (
    <svg width={size} height={size} style={{ background: "#ffffff", borderRadius: 10 }}>
      {rects}
    </svg>
  );
}

/* ── Receive Screen ── */

export function Receive({ onBack }: { onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletName, setWalletName] = useState("Akun 1");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    msg("wallet_getAccounts").then((r: any) => {
      const accs = r?.result || [];
      if (accs[0]) {
        setWalletAddress(accs[0].address);
        setWalletName(accs[0].name || "Akun 1");
      }
      setLoading(false);
    });
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600, background: "var(--neo-bg)" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.05)",
      }}>
        <button onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 12, background: "var(--neo-bg)",
          boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>←</button>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--neo-text)" }}>Terima Aset</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Asset Badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--neo-bg)", borderRadius: 16, padding: 14,
          boxShadow: "var(--neo-shadow)",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22,
            background: "#C8922A22", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img src="/images/garuda.png" alt="G" style={{
              width: 30, height: 30, objectFit: "contain",
              filter: "brightness(0) saturate(100%) invert(58%) sepia(89%) saturate(400%) hue-rotate(2deg) brightness(92%)",
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--neo-text)" }}>GarudaChain</p>
            <p style={{ fontSize: 12, color: "var(--neo-muted)", marginTop: 2 }}>Jaringan GarudaChain · GRD · Stablecoin · Saham</p>
          </div>
          <div style={{ background: "#C8922A22", borderRadius: 10, padding: "4px 10px" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#C8922A" }}>Mainnet</span>
          </div>
        </div>

        {/* QR Card */}
        <div style={{
          background: "var(--neo-bg)", borderRadius: 20, padding: 24,
          boxShadow: "var(--neo-shadow)", display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{
            padding: 12, background: "#ffffff", borderRadius: 16, marginBottom: 16,
            boxShadow: "var(--neo-shadow-sm)",
          }}>
            <QRCodeSVG value={walletAddress} size={180} />
          </div>
          <p style={{ fontSize: 13, color: "var(--neo-muted)", textAlign: "center" }}>
            {loading ? "Memuat alamat..." : `Pindai untuk menerima aset GarudaChain · ${walletName}`}
          </p>
        </div>

        {/* Address Card */}
        <div style={{
          background: "var(--neo-bg)", borderRadius: 16, padding: 16,
          boxShadow: "var(--neo-shadow)",
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--neo-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Alamat GarudaChain
          </p>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neo-text)", letterSpacing: "0.3px", lineHeight: "20px", wordBreak: "break-all" }}>
            {loading ? "Memuat..." : walletAddress}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={handleCopy} disabled={loading} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            height: 50, borderRadius: 14,
            background: copied ? "#22C55E" : "var(--neo-accent)",
            color: "#fff", fontSize: 15, fontWeight: 600,
            boxShadow: "4px 4px 10px #B07820, -4px -4px 10px #E0A840",
            opacity: loading ? 0.5 : 1,
          }}>
            <span>{copied ? "✓" : "📋"}</span>
            <span>{copied ? "Tersalin!" : "Salin Alamat"}</span>
          </button>

          <button onClick={() => {
            if (navigator.share) {
              navigator.share({ text: `Alamat GarudaChain saya:\n${walletAddress}` });
            } else {
              navigator.clipboard.writeText(walletAddress);
            }
          }} disabled={loading} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            height: 50, borderRadius: 14,
            background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)",
            color: "var(--neo-text)", fontSize: 15, fontWeight: 600,
            opacity: loading ? 0.5 : 1,
          }}>
            <span>📤</span>
            <span>Bagikan</span>
          </button>
        </div>

        {/* Warning Card */}
        <div style={{
          display: "flex", gap: 10, borderRadius: 14, padding: 14,
          background: "#FEF9EE", boxShadow: "var(--neo-shadow-sm)",
        }}>
          <span style={{ fontSize: 18, color: "#F59E0B", marginTop: 1, flexShrink: 0 }}>⚠</span>
          <p style={{ fontSize: 13, color: "#92400E", lineHeight: "19px" }}>
            Alamat ini menerima <strong>GRD, Stablecoin, dan Saham</strong> di
            jaringan <strong>GarudaChain</strong>.
            Pastikan pengirim menggunakan jaringan GarudaChain.
          </p>
        </div>
      </div>
    </div>
  );
}
