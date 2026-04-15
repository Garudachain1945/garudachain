import { useState, useEffect } from "react";

interface Pending {
  id: string; method: string;
  params: Record<string, unknown>;
  origin: string;
}

interface AccountInfo { name: string; address: string }

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

export function Approval() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [tab, setTab] = useState<"akun" | "izin">("akun");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("approval");
    if (id) {
      msg("get_pending_approval", { id }).then(r => {
        if (r?.result) setPending(r.result);
      });
    } else {
      msg("get_any_pending").then(r => {
        if (r?.result) setPending(r.result);
      });
    }
    msg("get_wallet_info").then(r => {
      if (r?.result?.accounts) setAccounts(r.result.accounts);
    });
  }, []);

  const respond = async (approved: boolean) => {
    if (!pending) return;
    await msg("approval_response", { id: pending.id, approved });
    window.close();
  };

  if (!pending) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      height:600, gap:16, color:"#6B7280", fontSize:13, background:"#fff",
    }}>
      <div style={{ width:32, height:32, border:"3px solid #E5E7EB", borderTopColor:"#C8922A", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      Memuat permintaan...
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  const isConnect = pending.method === "garuda_requestAccounts";

  // ─── Connect Approval (MetaMask-style with Akun/Izin tabs) ───
  if (isConnect) {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:600, background:"#fff", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 20px 16px", borderBottom:"1px solid #E5E7EB" }}>
          <img src="/images/garuda.png" alt="GarudaChain" style={{ width:52, height:52, objectFit:"contain", marginBottom:12 }} />
          <p style={{ fontSize:15, fontWeight:700, color:"#1F2937", margin:0 }}>{pending.origin}</p>
          <p style={{ fontSize:13, color:"#6B7280", margin:"4px 0 0" }}>Hubungkan situs web ini dengan GarudaChain</p>
        </div>

        {/* Tabs: Akun | Izin */}
        <div style={{ display:"flex", borderBottom:"1px solid #E5E7EB" }}>
          {(["akun", "izin"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex:1, padding:"12px 0", fontSize:14, fontWeight:600, cursor:"pointer",
                border:"none", background:"none",
                color: tab === t ? "#C8922A" : "#9CA3AF",
                borderBottom: tab === t ? "2px solid #C8922A" : "2px solid transparent",
              }}
            >
              {t === "akun" ? "Akun" : "Izin"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
          {tab === "akun" ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {accounts.map((acc, i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:12, padding:"14px 16px",
                  borderRadius:12, border:"1px solid #E5E7EB", background:"#FAFAFA",
                }}>
                  <div style={{
                    width:40, height:40, borderRadius:20, background:"linear-gradient(135deg, #DC143C, #C8922A)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"#fff", fontWeight:700, fontSize:16, flexShrink:0,
                  }}>
                    {acc.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:14, fontWeight:600, color:"#1F2937", margin:0 }}>{acc.name}</p>
                    <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {acc.address}
                    </p>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && (
                <p style={{ fontSize:13, color:"#9CA3AF", textAlign:"center", padding:20 }}>Tidak ada akun tersedia</p>
              )}
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:16, paddingTop:4 }}>
              {[
                { icon:"eye", label:"Melihat akun Anda dan menyarankan transaksi", sub:"Meminta untuk GarudaChain" },
                { icon:"globe", label:"Menggunakan jaringan aktif", sub:"Meminta untuk GarudaChain Regtest" },
              ].map((item, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
                  <div style={{
                    width:36, height:36, borderRadius:18, background:"#F3F4F6",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  }}>
                    {item.icon === "eye" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize:13, fontWeight:500, color:"#1F2937", margin:0 }}>{item.label}</p>
                    <p style={{ fontSize:11, color:"#9CA3AF", margin:"3px 0 0" }}>{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display:"flex", gap:12, padding:"16px 20px 28px", borderTop:"1px solid #E5E7EB" }}>
          <button
            onClick={() => respond(false)}
            style={{
              flex:1, padding:"12px 0", fontSize:14, fontWeight:600, borderRadius:24,
              border:"1px solid #D1D5DB", background:"#fff", color:"#374151", cursor:"pointer",
            }}
          >
            Batal
          </button>
          <button
            onClick={() => respond(true)}
            style={{
              flex:1, padding:"12px 0", fontSize:14, fontWeight:600, borderRadius:24,
              border:"none", background:"#C8922A", color:"#fff", cursor:"pointer",
            }}
          >
            Hubungkan
          </button>
        </div>
      </div>
    );
  }

  // ─── Transaction/Order/Sign Approval ───
  return (
    <div style={{ display:"flex", flexDirection:"column", height:600, background:"#fff", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 20px 16px", borderBottom:"1px solid #E5E7EB" }}>
        <img src="/images/garuda.png" alt="GarudaChain" style={{ width:48, height:48, objectFit:"contain", marginBottom:10 }} />
        <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>{pending.origin}</p>
        <div style={{
          marginTop:8, padding:"4px 14px", borderRadius:20, background:"#FEF3C7",
        }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#92400E" }}>{methodLabel(pending.method)}</span>
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
        <div style={{ borderRadius:12, border:"1px solid #E5E7EB", padding:16 }}>
          {pending.method === "garuda_placeOrder" && <OrderDetail params={pending.params as any} />}
          {pending.method === "garuda_signMessage" && <SignDetail params={pending.params as any} />}
          {pending.method === "garuda_sendTransaction" && <SendTransactionDetail params={pending.params as any} />}
          {pending.method === "garuda_sendToken" && <SendTokenDetail params={pending.params as any} />}
        </div>

        {/* Security note */}
        <div style={{
          display:"flex", gap:8, padding:12, borderRadius:10, marginTop:12,
          background:"#FFFBEB", border:"1px solid #FDE68A", alignItems:"center", fontSize:12,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ color:"#92400E" }}>Private key Anda tidak pernah dikirim ke website ini</span>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display:"flex", gap:12, padding:"16px 20px 28px", borderTop:"1px solid #E5E7EB" }}>
        <button
          onClick={() => respond(false)}
          style={{
            flex:1, padding:"12px 0", fontSize:14, fontWeight:600, borderRadius:24,
            border:"1px solid #D1D5DB", background:"#fff", color:"#374151", cursor:"pointer",
          }}
        >
          Tolak
        </button>
        <button
          onClick={() => respond(true)}
          style={{
            flex:1, padding:"12px 0", fontSize:14, fontWeight:600, borderRadius:24,
            border:"none", background:"#C8922A", color:"#fff", cursor:"pointer",
          }}
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
    case "garuda_sendTransaction": return "Kirim GRD";
    case "garuda_sendToken":       return "Kirim Token";
    default: return m;
  }
}

// ─── Detail Components ──────────────────────────────────────────────

function OrderDetail({ params }: { params: { assetId:string; side:string; price:number; amount:number; address:string } }) {
  const total = params.price * params.amount;
  const isBuy = params.side === "buy";
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{
        display:"inline-flex", alignSelf:"flex-start", padding:"4px 12px", borderRadius:6,
        background: isBuy ? "#ECFDF5" : "#FEF2F2", color: isBuy ? "#065F46" : "#991B1B",
        fontSize:13, fontWeight:700,
      }}>
        {isBuy ? "BUY" : "SELL"}
      </div>
      {[
        { label:"Jumlah", value: params.amount.toLocaleString("id-ID") },
        { label:"Harga / Unit", value: `${params.price.toLocaleString("id-ID")} GRD` },
        { label:"Total", value: `${total.toLocaleString("id-ID")} GRD`, bold:true },
        { label:"Dari Alamat", value: params.address.slice(0,16) + "..." },
      ].map(({ label, value, bold }) => (
        <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:12, color:"#6B7280" }}>{label}</span>
          <span style={{ fontSize:13, fontWeight: bold ? 700 : 500, color: bold ? "#C8922A" : "#1F2937" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function SendTransactionDetail({ params }: { params: { from:string; to:string; amount:number; kind?:string; memo?:string } }) {
  const kindLabel = params.kind === "deposit" ? "Deposit ke Trading" :
                    params.kind === "withdraw" ? "Withdraw ke L1" :
                    "Transfer GRD";
  const kindBg = params.kind === "deposit" ? "#ECFDF5" : params.kind === "withdraw" ? "#FFFBEB" : "#EFF6FF";
  const kindColor = params.kind === "deposit" ? "#065F46" : params.kind === "withdraw" ? "#92400E" : "#1E40AF";
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{
        display:"inline-flex", alignSelf:"flex-start", padding:"4px 12px", borderRadius:6,
        background: kindBg, color: kindColor, fontSize:13, fontWeight:700,
      }}>
        {kindLabel}
      </div>
      {[
        { label:"Jumlah", value: `${params.amount} GRD`, bold:true },
        { label:"Dari", value: params.from.slice(0,14) + "..." + params.from.slice(-6), mono:true },
        { label:"Ke", value: params.to.slice(0,14) + "..." + params.to.slice(-6), mono:true },
        ...(params.memo ? [{ label:"Memo", value: params.memo }] : []),
      ].map(({ label, value, bold, mono }: any) => (
        <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:12, color:"#6B7280" }}>{label}</span>
          <span style={{ fontSize:13, fontWeight: bold ? 700 : 500, fontFamily: mono ? "monospace" : undefined, color: bold ? "#C8922A" : "#1F2937" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function SendTokenDetail({ params }: { params: { from:string; to:string; assetId:string; amount:number } }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{
        display:"inline-flex", alignSelf:"flex-start", padding:"4px 12px", borderRadius:6,
        background:"#EFF6FF", color:"#1E40AF", fontSize:13, fontWeight:700,
      }}>
        Kirim Token
      </div>
      {[
        { label:"Jumlah", value: params.amount.toLocaleString("id-ID"), bold:true },
        { label:"Asset ID", value: params.assetId.slice(0,16) + "...", mono:true },
        { label:"Dari", value: params.from.slice(0,14) + "..." + params.from.slice(-6), mono:true },
        { label:"Ke", value: params.to.slice(0,14) + "..." + params.to.slice(-6), mono:true },
      ].map(({ label, value, bold, mono }: any) => (
        <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:12, color:"#6B7280" }}>{label}</span>
          <span style={{ fontSize:13, fontWeight: bold ? 700 : 500, fontFamily: mono ? "monospace" : undefined, color: bold ? "#C8922A" : "#1F2937" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function SignDetail({ params }: { params: { message:string; address:string } }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:"#6B7280" }}>Alamat</span>
        <span style={{ fontSize:12, fontFamily:"monospace", color:"#1F2937" }}>{params.address.slice(0,20)}...</span>
      </div>
      <div>
        <p style={{ fontSize:12, color:"#6B7280", margin:"0 0 6px" }}>Pesan</p>
        <div style={{
          borderRadius:8, padding:"10px 12px", fontSize:12,
          fontFamily:"monospace", wordBreak:"break-all",
          maxHeight:120, overflowY:"auto", color:"#1F2937",
          background:"#F9FAFB", border:"1px solid #E5E7EB",
        }}>
          {params.message}
        </div>
      </div>
    </div>
  );
}
