import { useState, useEffect } from "react";

interface Address {
  id: string;
  name: string;
  address: string;
  network: string;
  networkColor: string;
}

const Ico = {
  back: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M328 112L184 256l144 144" />
    </svg>
  ),
  plus: (c = "currentColor", s = 20) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round">
      <path d="M256 112v288" /><path d="M400 256H112" />
    </svg>
  ),
  search: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M221.09 64a157.09 157.09 0 10157.09 157.09A157.1 157.1 0 00221.09 64z" /><path d="M338.29 338.29L448 448" />
    </svg>
  ),
  copy: (c = "currentColor", s = 14) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinejoin="round">
      <rect x="128" y="128" width="336" height="336" rx="57" /><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24" />
    </svg>
  ),
  checkmark: (c = "currentColor", s = 14) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
      <path d="M416 128L192 384l-96-96" />
    </svg>
  ),
  trash: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M112 112l20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320" /><path d="M80 112h352" /><path d="M192 112V72h0a23.93 23.93 0 0124-24h80a23.93 23.93 0 0124 24h0v40" />
    </svg>
  ),
  close: (c = "currentColor", s = 16) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round">
      <path d="M368 144L144 368" /><path d="M368 368L144 144" />
    </svg>
  ),
  book: (c = "currentColor", s = 40) => (
    <svg width={s} height={s} viewBox="0 0 512 512" fill="none" stroke={c} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
      <path d="M256 160c16-63.16 76.16-95.41 208-96a15.94 15.94 0 0116 16v288a16 16 0 01-16 16c-128 0-177.45 25.81-208 64-30.37-38-80-64-208-64-9.88 0-16-8.05-16-17.93V80a15.94 15.94 0 0116-16c131.84.59 192 32.84 208 96z" />
      <path d="M256 160v288" />
    </svg>
  ),
};

const STORAGE_KEY = "garuda_addressbook";

export function BukuAlamat({ onBack }: { onBack: () => void }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAddresses(JSON.parse(saved));
    } catch {}
  }, []);

  function persist(list: Address[]) {
    setAddresses(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  const filtered = addresses.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.address.toLowerCase().includes(search.toLowerCase())
  );

  function handleCopy(addr: string, id: string) {
    navigator.clipboard.writeText(addr);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleDelete(id: string) {
    persist(addresses.filter(a => a.id !== id));
  }

  function handleAdd() {
    if (!newName.trim() || !newAddress.trim()) return;
    const entry: Address = {
      id: Date.now().toString(),
      name: newName.trim(),
      address: newAddress.trim(),
      network: "GarudaChain",
      networkColor: "#C8922A",
    };
    persist([...addresses, entry]);
    setNewName("");
    setNewAddress("");
    setShowAddModal(false);
  }

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
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)" }}>Buku Alamat</span>
        <button onClick={() => setShowAddModal(true)} style={{
          width: 40, height: 40, borderRadius: 12, background: "var(--neo-bg)",
          boxShadow: "var(--neo-shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>{Ico.plus("var(--neo-accent)")}</button>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          borderRadius: 14, padding: "0 14px", height: 44,
          background: "var(--neo-bg)", boxShadow: "var(--neo-inset-sm)",
        }}>
          {Ico.search("var(--neo-muted)")}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari alamat..." style={{
              flex: 1, border: "none", background: "transparent", boxShadow: "none",
              padding: 0, fontSize: 14, outline: "none",
            }} />
          {search && (
            <button onClick={() => setSearch("")} style={{ display: "flex" }}>
              {Ico.close("var(--neo-muted)")}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {Ico.book("var(--neo-muted)")}
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--neo-text)" }}>Tidak ada alamat tersimpan</p>
            <button onClick={() => setShowAddModal(true)} style={{
              padding: "8px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: "var(--neo-accent)", color: "#fff",
            }}>Tambah Alamat</button>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--neo-bg)", boxShadow: "var(--neo-shadow)" }}>
            {filtered.map((a, i) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                ...(i > 0 ? { borderTop: "1px solid rgba(0,0,0,0.05)" } : {}),
              }}>
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 22, flexShrink: 0,
                  background: a.networkColor + "22",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: a.networkColor }}>
                    {a.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--neo-text)" }}>{a.name}</p>
                  <p style={{
                    fontSize: 12, color: "var(--neo-muted)", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.address.slice(0, 14)}...{a.address.slice(-8)}
                  </p>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: a.networkColor,
                    background: a.networkColor + "15", borderRadius: 6, padding: "2px 6px",
                    display: "inline-block", marginTop: 4,
                  }}>{a.network}</span>
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleCopy(a.address, a.id)} style={{
                    width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
                  }}>
                    {copiedId === a.id ? Ico.checkmark("#22C55E") : Ico.copy("var(--neo-muted)")}
                  </button>
                  <button onClick={() => handleDelete(a.id)} style={{
                    width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
                  }}>
                    {Ico.trash("#EF4444")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
        }}>
          <div style={{
            width: "100%", maxWidth: 390, borderRadius: "20px 20px 0 0",
            padding: "20px 24px 34px", background: "var(--neo-bg)",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
          }}>
            {/* Handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#D1D5DD", margin: "0 auto 16px" }} />
            <p style={{ fontSize: 17, fontWeight: 700, color: "var(--neo-text)", marginBottom: 16 }}>Tambah Alamat Baru</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>Nama Label</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nama penerima"
                style={{ height: 44, borderRadius: 12, boxShadow: "var(--neo-inset-sm)" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>Alamat</label>
              <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="grd1q..."
                style={{ height: 44, borderRadius: 12, boxShadow: "var(--neo-inset-sm)" }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--neo-text)", display: "block", marginBottom: 6 }}>Jaringan</label>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 14px",
                background: "var(--neo-bg)", boxShadow: "var(--neo-shadow-sm)",
              }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, background: "#C8922A22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#C8922A" }}>G</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--neo-text)" }}>GarudaChain</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowAddModal(false); setNewName(""); setNewAddress(""); }}
                className="neo-btn" style={{
                  flex: 1, height: 48, background: "var(--neo-bg)", color: "var(--neo-muted)",
                  boxShadow: "var(--neo-shadow)", fontSize: 15,
                }}>Batal</button>
              <button onClick={handleAdd} disabled={!newName.trim() || !newAddress.trim()}
                className="neo-btn" style={{
                  flex: 1, height: 48, fontSize: 15,
                  background: newName.trim() && newAddress.trim() ? "var(--neo-accent)" : "#E8E8EC",
                  color: newName.trim() && newAddress.trim() ? "#fff" : "var(--neo-muted)",
                }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
