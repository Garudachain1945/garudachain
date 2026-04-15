import { useState, useEffect } from "react";

const API = "http://localhost:5000";

interface Notif {
  id: string;
  category: "transaksi" | "sistem";
  icon: "send" | "receive" | "info";
  iconColor: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

const Ico = {
  back: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M328 112L184 256l144 144" />
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
  info: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M256 56C145.72 56 56 145.72 56 256s89.72 200 200 200 200-89.72 200-200S366.28 56 256 56z" />
      <path d="M256 232v120" /><circle cx="256" cy="172" r="12" fill={c} />
    </svg>
  ),
};

type CategoryFilter = "Semua" | "Transaksi" | "Sistem";

export function Notifikasi({ onBack }: { onBack: () => void }) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("Semua");
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await msg("wallet_getAccounts");
        const addr = r?.result?.[0]?.address;
        if (!addr) { setLoading(false); return; }
        const info = await msg("wallet_getAddressInfo", { address: addr });
        const txs = info?.result?.transactions || [];
        const mapped: Notif[] = txs.slice(0, 20).map((tx: any, i: number) => {
          const isSend = tx.type === "send";
          const amt = ((tx.amount || 0) / 1e8).toLocaleString("id-ID", { maximumFractionDigits: 4 });
          const date = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
          return {
            id: tx.txid || String(i),
            category: "transaksi" as const,
            icon: isSend ? "send" as const : "receive" as const,
            iconColor: isSend ? "#EF4444" : "#22C55E",
            title: isSend ? "Kirim GRD" : "Terima GRD",
            body: `${isSend ? "-" : "+"}${amt} GRD${tx.to ? ` ke ${tx.to.slice(0, 12)}...` : ""}`,
            time: date,
            read: i >= 3,
          };
        });
        // Add system welcome
        mapped.push({
          id: "sys-welcome",
          category: "sistem",
          icon: "info",
          iconColor: "var(--neo-accent)",
          title: "Selamat datang di GarudaChain",
          body: "Dompet Anda sudah aktif dan siap digunakan.",
          time: "Hari ini",
          read: true,
        });
        setNotifs(mapped);
      } finally { setLoading(false); }
    })();
  }, []);

  const unreadCount = notifs.filter(n => !n.read).length;
  const filtered = activeCategory === "Semua" ? notifs
    : activeCategory === "Transaksi" ? notifs.filter(n => n.category === "transaksi")
    : notifs.filter(n => n.category === "sistem");

  function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  function renderIcon(n: Notif) {
    if (n.icon === "send") return Ico.arrowUp("#fff");
    if (n.icon === "receive") return Ico.arrowDown("#fff");
    return Ico.info("#fff");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600, background: "var(--neo-bg)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{
            width: 40, height: 40, borderRadius: 12, background: "var(--neo-bg)",
            boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>{Ico.back("var(--neo-text)")}</button>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Notifikasi</span>
          {unreadCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "var(--neo-accent)", borderRadius: 10,
              padding: "2px 8px", minWidth: 20, textAlign: "center",
            }}>{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-accent)" }}>
            Semua dibaca
          </button>
        )}
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto" }}>
        {(["Semua", "Transaksi", "Sistem"] as CategoryFilter[]).map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} style={{
            padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            background: activeCategory === cat ? "var(--neo-accent)" : "var(--neo-bg)",
            color: activeCategory === cat ? "#fff" : "var(--neo-muted)",
            boxShadow: activeCategory === cat ? "none" : "var(--neo-shadow-sm)",
          }}>{cat}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {loading && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--neo-muted)" }}>Memuat...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {Ico.info("var(--neo-muted)", 40)}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--neo-text)" }}>Tidak ada notifikasi</p>
            <p style={{ fontSize: 13, color: "var(--neo-muted)", marginTop: 4 }}>Belum ada aktivitas terbaru</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)" }}>
            {filtered.map((n, i) => (
              <div key={n.id} onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", cursor: "pointer",
                  ...(i > 0 ? { borderTop: "1px solid rgba(0,0,0,0.05)" } : {}),
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                  background: n.iconColor, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {renderIcon(n)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: n.read ? 500 : 700, color: "var(--neo-text)" }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: "var(--neo-muted)", flexShrink: 0, marginLeft: 8 }}>{n.time}</span>
                  </div>
                  <p style={{
                    fontSize: 13, color: "var(--neo-muted)", lineHeight: "18px",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  } as any}>{n.body}</p>
                </div>
                {!n.read && (
                  <div style={{
                    width: 8, height: 8, borderRadius: 4, background: "var(--neo-accent)",
                    flexShrink: 0, marginTop: 6,
                  }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
