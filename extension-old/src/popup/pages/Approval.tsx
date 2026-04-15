import { useState, useEffect } from "react";
import { GarudaFox } from "../App";

interface Pending {
  id: string; method: string;
  params: Record<string, unknown>;
  origin: string;
}

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

export function Approval() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("approval");
    if (!id) return;
    msg("get_pending_approval", { id }).then(r => {
      if (r?.result) setPending(r.result);
    });
  }, []);

  const respond = async (approved: boolean) => {
    if (!pending) return;
    await msg("approval_response", { id: pending.id, approved });
    window.close();
  };

  if (!pending) return (
    <div style={{
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      height:600, gap:16, color:"var(--t3)", fontSize:13,
    }}>
      <span style={{ fontSize:32 }}>⏳</span>
      Memuat permintaan...
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:600, background:"var(--bg)" }}>

      {/* ── Header ── */}
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center",
        padding:"24px 20px 16px", gap:12,
        borderBottom:"1px solid var(--border-2)",
        background:"linear-gradient(180deg, #fff5f5 0%, #fff 100%)",
      }}>
        <GarudaFox size={56} />
        <div style={{ textAlign:"center" }}>
          <p style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em" }}>Permintaan dari</p>
          <p style={{ fontSize:15, fontWeight:700, color:"var(--t1)", marginTop:3 }}>
            {pending.origin}
          </p>
        </div>
      </div>

      {/* ── Request detail ── */}
      <div style={{ flex:1, padding:"16px 20px", display:"flex", flexDirection:"column", gap:14, overflowY:"auto" }}>

        {/* Request type badge */}
        <div style={{
          display:"inline-flex", alignSelf:"center",
          background:"var(--bg-alt)", borderRadius:"var(--r-pill)",
          padding:"5px 14px", border:"1px solid var(--border-2)",
        }}>
          <span style={{ fontSize:12, fontWeight:700, color:"var(--t2)", letterSpacing:".02em" }}>
            {methodLabel(pending.method)}
          </span>
        </div>

        {/* Content */}
        <div className="mm-card">
          {pending.method === "garuda_requestAccounts" && <ConnectDetail origin={pending.origin} />}
          {pending.method === "garuda_placeOrder"      && <OrderDetail params={pending.params as any} />}
          {pending.method === "garuda_signMessage"     && <SignDetail   params={pending.params as any} />}
        </div>

        {/* Security note */}
        <div className="mm-banner mm-banner-success" style={{ fontSize:11 }}>
          <span style={{ flexShrink:0 }}>🔐</span>
          <span>Private key Anda tidak pernah dikirim ke website ini</span>
        </div>
      </div>

      {/* ── Action buttons — persis MetaMask ── */}
      <div style={{
        display:"flex", gap:12, padding:"16px 20px 24px",
        borderTop:"1px solid var(--border-2)",
      }}>
        <button
          onClick={() => respond(false)}
          className="mm-btn mm-btn-secondary"
          style={{ fontSize:14 }}
        >
          Tolak
        </button>
        <button
          onClick={() => respond(true)}
          className="mm-btn mm-btn-primary"
          style={{ fontSize:14 }}
        >
          Setujui
        </button>
      </div>
    </div>
  );
}

function methodLabel(m: string) {
  switch (m) {
    case "garuda_requestAccounts": return "Permintaan Koneksi";
    case "garuda_placeOrder":      return "Konfirmasi Order DEX";
    case "garuda_signMessage":     return "Tanda Tangan Pesan";
    default: return m;
  }
}

/* ── Connect detail ───────────────────────────────────────────────────────── */
function ConnectDetail({ origin }: { origin: string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{
          width:44, height:44, borderRadius:12,
          background:"var(--bg)", border:"1.5px solid var(--border-2)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:24,
        }}>🌐</div>
        <div>
          <p style={{ fontWeight:700, fontSize:14, color:"var(--t1)" }}>{origin}</p>
          <p style={{ fontSize:12, color:"var(--t3)" }}>ingin terhubung ke wallet Anda</p>
        </div>
      </div>

      <div style={{ background:"var(--bg)", borderRadius:"var(--r-sm)", padding:12, display:"flex", flexDirection:"column", gap:8 }}>
        <p style={{ fontSize:12, fontWeight:700, color:"var(--t1)", marginBottom:2 }}>
          Website ini akan dapat:
        </p>
        {["Melihat alamat wallet Anda", "Melihat saldo dan aset Anda", "Meminta konfirmasi transaksi"].map(t => (
          <div key={t} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:"var(--success)", fontSize:14 }}>✓</span>
            <span style={{ fontSize:12, color:"var(--t2)" }}>{t}</span>
          </div>
        ))}
        <div className="mm-divider" style={{ margin:"6px 0" }} />
        <p style={{ fontSize:12, fontWeight:700, color:"var(--error)", marginBottom:2 }}>
          Website ini TIDAK dapat:
        </p>
        {["Mengakses private key Anda", "Mengirim aset tanpa persetujuan"].map(t => (
          <div key={t} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:"var(--error)", fontSize:14 }}>✕</span>
            <span style={{ fontSize:12, color:"var(--t2)" }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Order detail ─────────────────────────────────────────────────────────── */
function OrderDetail({ params }: { params: { assetId:string; side:string; price:number; amount:number; address:string } }) {
  const total = params.price * params.amount;
  const isBuy = params.side === "buy";
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{
          fontSize:20, fontWeight:800,
          color: isBuy ? "var(--success)" : "var(--error)",
        }}>
          {isBuy ? "BELI" : "JUAL"}
        </span>
        <span style={{ fontSize:11, color:"var(--t3)", fontFamily:"monospace" }}>
          {params.assetId.slice(0,18)}...
        </span>
      </div>
      {[
        { label:"Jumlah",       value: params.amount.toLocaleString("id-ID") },
        { label:"Harga / Unit", value: `${params.price.toLocaleString("id-ID")} GRD` },
        { label:"Total",        value: `${total.toLocaleString("id-ID")} GRD`, bold:true },
        { label:"Dari Alamat",  value: params.address.slice(0,16) + "..." },
      ].map(({ label, value, bold }) => (
        <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:12, color:"var(--t3)" }}>{label}</span>
          <span style={{ fontSize:13, fontWeight: bold ? 700 : 500, color: bold ? "var(--primary)" : "var(--t1)" }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Sign detail ──────────────────────────────────────────────────────────── */
function SignDetail({ params }: { params: { message:string; address:string } }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:12, color:"var(--t3)" }}>Alamat</span>
        <span style={{ fontSize:12, fontFamily:"monospace", color:"var(--t1)" }}>
          {params.address.slice(0,16)}...
        </span>
      </div>
      <div>
        <p style={{ fontSize:11, color:"var(--t3)", marginBottom:6 }}>Pesan</p>
        <div style={{
          background:"var(--bg)", borderRadius:"var(--r-sm)",
          border:"1px solid var(--border-2)",
          padding:"10px 12px", fontSize:12,
          fontFamily:"monospace", wordBreak:"break-all",
          maxHeight:120, overflowY:"auto", color:"var(--t1)",
        }}>
          {params.message}
        </div>
      </div>
    </div>
  );
}
