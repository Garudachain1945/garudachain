/* Welcome — sama persis mobile (tabs)/index.tsx */

export function Welcome({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-between",
      height:600, padding:"0 24px", paddingTop:67, paddingBottom:54,
      background:"var(--neo-bg)",
    }}>
      {/* Top — logo + title */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", width:"100%", gap:24 }}>
        {/* Garuda image — sama mobile (tabs)/index.tsx */}
        <img
          src="/images/garuda.png"
          alt="Garuda"
          style={{ width: 200, height: 200, objectFit:"contain" }}
        />

        <div style={{ textAlign:"center" }}>
          <p style={{ fontSize:36, fontWeight:700, color:"var(--neo-accent)", letterSpacing:"-.5px" }}>
            Dompet Digital
          </p>
          <p style={{ fontSize:14, color:"var(--neo-muted)", letterSpacing:2, textTransform:"uppercase", marginTop:8 }}>
            Bhinneka Tunggal Ika
          </p>
        </div>
      </div>

      {/* Bottom — buttons */}
      <div style={{ width:"100%", display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
        {/* Buat dompet baru — raised neo button */}
        <button className="neo-btn neo-btn-raised" onClick={onCreate}>
          Buat dompet baru
        </button>

        {/* Sudah memiliki dompet — gold button */}
        <button className="neo-btn neo-btn-primary" onClick={onImport}>
          Saya sudah memiliki dompet
        </button>

        <p style={{ fontSize:12, color:"var(--neo-muted)", textAlign:"center", marginTop:8, lineHeight:"18px" }}>
          Dengan melanjutkan, Anda menyetujui<br />
          <span style={{ color:"var(--neo-accent)" }}>Syarat & Ketentuan</span> kami
        </p>
      </div>
    </div>
  );
}
