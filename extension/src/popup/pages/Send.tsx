import { useState, useEffect } from "react";

const API = "http://localhost:5000";
const FEE_SATOSHI = 1000;

interface SendAsset {
  assetId: string;
  symbol: string;
  name: string;
  tipe: "NATIVE" | "STABLECOIN" | "STABLECOIN_PEGGED" | "SAHAM";
}

const GRD_ASSET: SendAsset = {
  assetId: "native-grd",
  symbol: "GRD",
  name: "GarudaChain",
  tipe: "NATIVE",
};

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

function formatGRD(satoshi: number): string {
  return (satoshi / 1e8).toLocaleString("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 8 }) + " GRD";
}

function tipeLabel(tipe: SendAsset["tipe"]) {
  if (tipe === "NATIVE") return "Native";
  if (tipe === "STABLECOIN") return "Stablecoin";
  if (tipe === "STABLECOIN_PEGGED") return "Oracle";
  return "Saham";
}

function tipeColor(tipe: SendAsset["tipe"]) {
  if (tipe === "NATIVE") return "#C8922A";
  if (tipe === "STABLECOIN" || tipe === "STABLECOIN_PEGGED") return "#2563EB";
  return "#8B0000";
}

export function Send({ onBack }: { onBack: () => void }) {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [balanceSatoshi, setBalanceSatoshi] = useState(0);
  const [myAddress, setMyAddress] = useState("");
  const [txid, setTxid] = useState("");
  const [error, setError] = useState("");

  const [selectedAsset, setSelectedAsset] = useState<SendAsset>(GRD_ASSET);
  const [assetList, setAssetList] = useState<SendAsset[]>([GRD_ASSET]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  useEffect(() => {
    msg("wallet_getAccounts").then((r: any) => {
      const accs = r?.result || [];
      if (accs[0]) {
        setMyAddress(accs[0].address);
        // Get balance
        msg("wallet_getAddressInfo", { address: accs[0].address }).then((r2: any) => {
          if (r2?.result) setBalanceSatoshi(r2.result.balance ?? 0);
        });
      }
    });
    // Load asset list
    msg("wallet_getAssetList").then((r: any) => {
      const list: SendAsset[] = [GRD_ASSET, ...(r?.result || [])];
      setAssetList(list);
    });
  }, []);

  const amountNum = parseFloat(amount || "0");
  const amountSatoshi = Math.floor(amountNum * 1e8);

  const canSend = (() => {
    if (!address.startsWith("grd1") || amountNum <= 0) return false;
    if (selectedAsset.tipe === "NATIVE") {
      return amountSatoshi + FEE_SATOSHI <= balanceSatoshi;
    }
    return true;
  })();

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    if (text) setAddress(text.trim());
  };

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError("");
    try {
      let result: any;
      if (selectedAsset.tipe === "NATIVE") {
        result = await msg("wallet_sendNative", { to: address, amount: amountSatoshi });
      } else {
        result = await msg("wallet_sendToken", { to: address, amount: amountNum, assetId: selectedAsset.assetId });
      }
      if (result?.error) throw new Error(result.error);
      if (result?.result?.txid) {
        setTxid(result.result.txid);
      } else if (result?.result?.error) {
        throw new Error(result.result.error);
      } else {
        setTxid(result?.result?.txid || "success");
      }
      setShowConfirm(false);
    } catch (e: any) {
      setError(e.message || "Gagal mengirim transaksi");
    } finally {
      setSending(false);
    }
  };

  const filteredAssets = assetList.filter(a => {
    if (!pickerSearch) return true;
    return a.symbol.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      a.name.toLowerCase().includes(pickerSearch.toLowerCase());
  });

  /* ── Success ── */
  if (txid) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: 600, padding: 32, background: "var(--neo-bg)", gap: 16,
    }}>
      <span style={{ fontSize: 56, color: "#22C55E" }}>✓</span>
      <p style={{ fontSize: 24, fontWeight: 700, color: "var(--neo-text)" }}>Berhasil Terkirim!</p>
      <p style={{ fontSize: 12, color: "var(--neo-muted)", textAlign: "center", wordBreak: "break-all" }}>
        TXID: {txid.length > 20 ? `${txid.slice(0, 16)}...${txid.slice(-8)}` : txid}
      </p>
      <button className="neo-btn neo-btn-primary" onClick={onBack} style={{ marginTop: 24 }}>
        Kembali ke Beranda
      </button>
    </div>
  );

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
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--neo-text)" }}>Kirim {selectedAsset.symbol}</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>

        {/* Asset Selector */}
        <button onClick={() => { setShowPicker(true); setPickerSearch(""); }} style={{
          display: "flex", alignItems: "center", width: "100%", gap: 12,
          background: "var(--neo-bg)", borderRadius: 18, padding: 14,
          boxShadow: "var(--neo-shadow)", textAlign: "left",
        }}>
          <AssetIcon symbol={selectedAsset.symbol} tipe={selectedAsset.tipe} size={44} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--neo-text)", marginBottom: 2 }}>{selectedAsset.name}</p>
            <p style={{ fontSize: 12, color: "var(--neo-muted)" }}>
              {selectedAsset.tipe === "NATIVE"
                ? `Saldo: ${formatGRD(balanceSatoshi)}`
                : `Tipe: ${tipeLabel(selectedAsset.tipe)}`}
            </p>
          </div>
          <div style={{
            borderRadius: 20, padding: "5px 10px",
            background: tipeColor(selectedAsset.tipe) + "22",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: tipeColor(selectedAsset.tipe) }}>
              {tipeLabel(selectedAsset.tipe)}
            </span>
          </div>
          <span style={{ fontSize: 14, color: "var(--neo-muted)" }}>▼</span>
        </button>

        {/* Address Input */}
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-muted)", marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Alamat Penerima
        </p>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--neo-bg)", borderRadius: 14, padding: "4px 14px",
          boxShadow: "var(--neo-inset)",
        }}>
          <input
            value={address} onChange={e => setAddress(e.target.value)}
            placeholder="grd1q..."
            style={{ flex: 1, border: "none", background: "transparent", padding: 0, height: 48, fontSize: 15, boxShadow: "none" }}
          />
          <button onClick={handlePaste} style={{ padding: 6, fontSize: 18, color: "var(--neo-accent)" }}>📋</button>
        </div>
        {address.length > 0 && !address.startsWith("grd1") && (
          <p style={{ fontSize: 12, color: "#EF4444", marginTop: 6, marginLeft: 4 }}>Alamat harus dimulai dengan grd1</p>
        )}

        {/* Amount Input */}
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-muted)", marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Jumlah ({selectedAsset.symbol})
        </p>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--neo-bg)", borderRadius: 14, padding: "4px 14px",
          boxShadow: "var(--neo-inset)",
        }}>
          <input
            type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            style={{ flex: 1, border: "none", background: "transparent", padding: 0, height: 48, fontSize: 15, boxShadow: "none" }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--neo-muted)" }}>{selectedAsset.symbol}</span>
          {selectedAsset.tipe === "NATIVE" && (
            <button onClick={() => {
              const max = Math.max(0, balanceSatoshi - FEE_SATOSHI);
              setAmount((max / 1e8).toFixed(8));
            }} style={{
              borderRadius: 8, padding: "5px 10px",
              background: "var(--neo-accent)22", fontSize: 12, fontWeight: 700, color: "var(--neo-accent)",
            }}>MAX</button>
          )}
        </div>

        {/* Summary Card */}
        <div style={{
          marginTop: 20, background: "var(--neo-bg)", borderRadius: 18, padding: 18,
          boxShadow: "var(--neo-shadow)",
        }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--neo-text)", marginBottom: 14 }}>Ringkasan Transaksi</p>

          <SummaryRow label="Aset" value={`${selectedAsset.name} (${selectedAsset.symbol})`} />
          <SummaryRow label="Jumlah Kirim" value={`${amount || "0"} ${selectedAsset.symbol}`} />
          {selectedAsset.tipe === "NATIVE" && (
            <SummaryRow label="Biaya Jaringan (est.)" value={formatGRD(FEE_SATOSHI)} />
          )}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", marginTop: 8, paddingTop: 10 }}>
            <SummaryRow
              label="Penerima Dapat"
              value={amount ? `~${amount} ${selectedAsset.symbol}` : "—"}
              bold accent
            />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "#EF4444", textAlign: "center", marginTop: 12 }}>{error}</p>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        padding: "12px 20px 34px", background: "var(--neo-bg)",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        boxShadow: "0px -4px 12px #D1D5DD",
      }}>
        <button
          className="neo-btn neo-btn-primary"
          onClick={() => setShowConfirm(true)}
          disabled={!canSend}
          style={{ opacity: canSend ? 1 : 0.4, fontSize: 16 }}
        >
          Kirim {selectedAsset.symbol}
        </button>
      </div>

      {/* Confirm Sheet */}
      {showConfirm && (
        <div style={{ position: "absolute", inset: 0, zIndex: 100 }}>
          <div onClick={() => !sending && setShowConfirm(false)} style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
          }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 101,
            background: "var(--neo-bg)", borderRadius: "28px 28px 0 0", padding: 24, paddingBottom: 40,
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.12)", margin: "0 auto 20px" }} />
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--neo-text)", textAlign: "center", marginBottom: 16 }}>
              Konfirmasi Pengiriman
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <AssetIcon symbol={selectedAsset.symbol} tipe={selectedAsset.tipe} size={52} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "var(--neo-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Kirim</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--neo-accent)" }}>{amount} {selectedAsset.symbol}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "var(--neo-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Ke Alamat</p>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neo-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{address}</p>
            </div>
            {selectedAsset.tipe === "NATIVE" && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "var(--neo-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Biaya Jaringan</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: "var(--neo-text)" }}>{formatGRD(FEE_SATOSHI)}</p>
              </div>
            )}

            {error && <p style={{ fontSize: 13, color: "#EF4444", textAlign: "center", marginBottom: 8 }}>{error}</p>}

            <button
              className="neo-btn neo-btn-primary"
              onClick={handleSend}
              disabled={sending}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}
            >
              <span>📤</span>
              <span>{sending ? "Mengirim..." : "Kirim Sekarang"}</span>
            </button>
            <button
              onClick={() => !sending && setShowConfirm(false)}
              disabled={sending}
              style={{ width: "100%", textAlign: "center", marginTop: 14, fontSize: 15, fontWeight: 500, color: "var(--neo-muted)", padding: 8 }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Asset Picker Modal */}
      {showPicker && (
        <div style={{ position: "absolute", inset: 0, zIndex: 200, background: "var(--neo-bg)", display: "flex", flexDirection: "column" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: 16, borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--neo-text)" }}>Pilih Aset</span>
            <button onClick={() => setShowPicker(false)} style={{ fontSize: 22, color: "var(--neo-text)", padding: 4 }}>✕</button>
          </div>

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            margin: "12px 16px", background: "#F3F4F6", borderRadius: 12, padding: "10px 12px",
          }}>
            <span style={{ fontSize: 16, color: "var(--neo-muted)" }}>🔍</span>
            <input
              value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="Cari aset..." autoFocus
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, boxShadow: "none", padding: 0 }}
            />
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredAssets.map(asset => (
              <button key={asset.assetId} onClick={() => {
                setSelectedAsset(asset);
                setAmount("");
                setShowPicker(false);
              }} style={{
                display: "flex", alignItems: "center", width: "100%", textAlign: "left",
                padding: "14px 16px", gap: 12,
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                background: selectedAsset.assetId === asset.assetId ? "rgba(200,146,42,0.07)" : "transparent",
              }}>
                <AssetIcon symbol={asset.symbol} tipe={asset.tipe} size={40} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--neo-text)", marginBottom: 2 }}>{asset.symbol}</p>
                  <p style={{ fontSize: 12, color: "var(--neo-muted)" }}>{asset.name}</p>
                </div>
                <div style={{
                  borderRadius: 20, padding: "5px 10px",
                  background: tipeColor(asset.tipe) + "22",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: tipeColor(asset.tipe) }}>{tipeLabel(asset.tipe)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper Components ── */

function AssetIcon({ symbol, tipe, size }: { symbol: string; tipe: SendAsset["tipe"]; size: number }) {
  const color = tipeColor(tipe);
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: color + "22", border: `1.5px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontSize: size * 0.4, fontWeight: 700, color }}>{symbol.slice(0, 1)}</span>
    </div>
  );
}

function SummaryRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: bold ? "var(--neo-text)" : "var(--neo-muted)", fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: bold ? 700 : 600,
        color: accent ? "var(--neo-accent)" : "var(--neo-text)",
        textAlign: "right", marginLeft: 8,
      }}>{value}</span>
    </div>
  );
}
