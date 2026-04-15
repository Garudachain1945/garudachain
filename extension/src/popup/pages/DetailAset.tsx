import { useState, useEffect } from "react";

const API = "http://localhost:5000";

interface TxItem {
  txid: string;
  type?: string;
  amount?: number;
  fee?: number;
  timestamp?: number;
  from?: string;
  to?: string;
}

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
  star: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinejoin="round">
      <path d="M480 208H308L256 48l-52 160H32l148 108-56 168 132-96 132 96-56-168z" />
    </svg>
  ),
  arrowUp: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M112 244l144-144 144 144" /><path d="M256 120v292" />
    </svg>
  ),
  arrowDown: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M400 268L256 412 112 268" /><path d="M256 392V100" />
    </svg>
  ),
};

const TIME_FILTERS = ["1J", "1W", "1M", "3M", "1T", "Semua"] as const;

export function DetailAset({ onBack, onSend, onReceive, assetId }: {
  onBack: () => void; onSend: () => void; onReceive: () => void; assetId?: string;
}) {
  const [activeFilter, setActiveFilter] = useState<string>("1M");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState(0);
  const [txHistory, setTxHistory] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await msg("wallet_getAccounts");
        const addr = r?.result?.[0]?.address;
        if (!addr) return;
        setAddress(addr);
        const info = await msg("wallet_getAddressInfo", { address: addr });
        if (info?.result) {
          setBalance(info.result.balance ?? 0);
          setTxHistory(info.result.transactions ?? []);
        }
      } finally { setLoading(false); }
    })();
  }, []);

  function fmt(n: number) {
    return (n / 1e8).toLocaleString("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  function shortAddr(a: string) {
    return a ? `${a.slice(0, 8)}...${a.slice(-6)}` : "—";
  }

  function fmtDate(ts?: number) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  const totalReceived = txHistory.filter(t => t.type === "receive").reduce((s, t) => s + (t.amount || 0), 0);
  const totalSent = txHistory.filter(t => t.type === "send").reduce((s, t) => s + (t.amount || 0), 0);
  const recentTx = txHistory.slice(0, 5);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            background: "var(--neo-accent)22", border: "1.5px solid var(--neo-accent)55",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--neo-accent)" }}>G</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--neo-text)" }}>GarudaChain</span>
          <span style={{ fontSize: 13, color: "var(--neo-muted)" }}>GRD</span>
        </div>
        <button style={{
          width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{Ico.star("var(--neo-muted)")}</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>

        {/* Balance Card */}
        <div style={{
          borderRadius: 20, padding: 20, marginBottom: 16,
          background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-lg)",
        }}>
          <p style={{ fontSize: 13, color: "var(--neo-muted)", marginBottom: 4 }}>Saldo</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "var(--neo-accent)", letterSpacing: "-.5px" }}>
            {loading ? "Memuat..." : fmt(balance) + " GRD"}
          </p>
          <p style={{ fontSize: 12, color: "var(--neo-muted)", marginTop: 4 }}>GarudaChain Mainnet</p>
        </div>

        {/* Time filter chips */}
        <div style={{
          borderRadius: 16, padding: 16, marginBottom: 16,
          background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)",
        }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {TIME_FILTERS.map(f => (
              <button key={f} onClick={() => setActiveFilter(f)} style={{
                flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: activeFilter === f ? "var(--neo-accent)" : "var(--neo-bg)",
                color: activeFilter === f ? "#fff" : "var(--neo-muted)",
                boxShadow: activeFilter === f ? "none" : "var(--neo-shadow-sm)",
              }}>{f}</button>
            ))}
          </div>
          {/* Mini chart placeholder */}
          <div style={{
            height: 80, borderRadius: 12, background: "var(--neo-bg)", boxShadow: "var(--neo-inset-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <p style={{ fontSize: 12, color: "var(--neo-muted)" }}>
              {txHistory.length} transaksi · {fmt(balance)} GRD
            </p>
          </div>
        </div>

        {/* Stats Grid 2x2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Total Diterima", value: fmt(totalReceived), color: "#22C55E" },
            { label: "Total Dikirim", value: fmt(totalSent), color: "#EF4444" },
            { label: "Jumlah TX", value: String(txHistory.length), color: "var(--neo-text)" },
            { label: "Network", value: "GarudaChain", color: "var(--neo-accent)" },
          ].map(s => (
            <div key={s.label} style={{
              borderRadius: 14, padding: 14, background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
            }}>
              <p style={{ fontSize: 11, color: "var(--neo-muted)", marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Recent Transactions */}
        <div style={{
          borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--neo-text)" }}>Transaksi Terbaru</p>
          </div>
          {recentTx.length === 0 && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--neo-muted)" }}>Belum ada transaksi</p>
            </div>
          )}
          {recentTx.map((tx, i) => {
            const isSend = tx.type === "send";
            return (
              <div key={tx.txid || i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                ...(i > 0 ? { borderTop: "1px solid rgba(0,0,0,0.05)" } : {}),
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                  background: isSend ? "#EF444422" : "#22C55E22",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSend ? Ico.arrowUp("#EF4444") : Ico.arrowDown("#22C55E")}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)" }}>
                    {isSend ? "Kirim" : "Terima"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--neo-muted)" }}>{fmtDate(tx.timestamp)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: isSend ? "#EF4444" : "#22C55E" }}>
                    {isSend ? "-" : "+"}{fmt(tx.amount || 0)}
                  </p>
                  {tx.fee ? <p style={{ fontSize: 11, color: "var(--neo-muted)" }}>Fee: {tx.fee}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: "flex", gap: 12, padding: "12px 20px 24px",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <button onClick={onSend} className="neo-btn" style={{
          flex: 1, height: 48, fontSize: 15,
          background: "var(--neo-accent)", color: "#fff",
        }}>Kirim</button>
        <button onClick={onReceive} className="neo-btn" style={{
          flex: 1, height: 48, fontSize: 15,
          background: "var(--neo-bg)", color: "var(--neo-text)",
          boxShadow: "var(--neo-shadow)",
        }}>Terima</button>
      </div>
    </div>
  );
}
