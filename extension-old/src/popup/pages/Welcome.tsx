import { GarudaFox } from "../App";

export function Welcome({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:600, background:"var(--bg)" }}>

      {/* Hero area — like MetaMask welcome */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"32px 28px 20px", gap:24,
        background:"linear-gradient(180deg, #fff5f5 0%, #ffffff 60%)",
      }}>
        <GarudaFox size={120} />

        <div style={{ textAlign:"center", maxWidth:280 }}>
          <h1 style={{ fontSize:24, fontWeight:800, color:"var(--t1)", letterSpacing:"-.02em", lineHeight:1.2 }}>
            Selamat Datang di<br />
            <span style={{ color:"var(--primary)" }}>GarudaChain Wallet</span>
          </h1>
          <p style={{ fontSize:13, color:"var(--t2)", marginTop:10, lineHeight:1.6 }}>
            Kelola GRD dan aset digital Indonesia.<br />
            100% non-custodial — private key hanya di perangkat Anda.
          </p>
        </div>

        {/* Trust badge — seperti MetaMask "Trusted by millions" */}
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          background:"var(--success-bg)", border:"1px solid #a5d6a7",
          borderRadius:"var(--r-pill)", padding:"8px 16px",
        }}>
          <span style={{ fontSize:16 }}>🛡️</span>
          <span style={{ fontSize:12, fontWeight:600, color:"var(--success)" }}>
            Non-Custodial · Open Source · Secure
          </span>
        </div>
      </div>

      {/* CTA buttons */}
      <div style={{ padding:"20px 24px 28px", display:"flex", flexDirection:"column", gap:12 }}>
        <button className="mm-btn mm-btn-primary" onClick={onCreate}>
          Buat Wallet Baru
        </button>
        <button className="mm-btn mm-btn-secondary" onClick={onImport}>
          Impor Wallet Existing
        </button>
        <p style={{ textAlign:"center", fontSize:11, color:"var(--t3)", marginTop:6 }}>
          GarudaChain Wallet v1.0.0 · Regtest
        </p>
      </div>
    </div>
  );
}
