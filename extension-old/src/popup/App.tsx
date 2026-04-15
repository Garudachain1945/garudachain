import { useState, useEffect } from "react";
import { Welcome }      from "./pages/Welcome";
import { CreateWallet } from "./pages/CreateWallet";
import { ImportWallet } from "./pages/ImportWallet";
import { Home }         from "./pages/Home";
import { Approval }     from "./pages/Approval";

type Page = "loading" | "welcome" | "create" | "import" | "home" | "approval";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

export function App() {
  const [page, setPage] = useState<Page>("loading");

  useEffect(() => {
    const aid = new URLSearchParams(window.location.search).get("approval");
    if (aid) { setPage("approval"); return; }
    msg("wallet_hasVault").then((r: any) => {
      setPage(r?.result ? "home" : "welcome");
    });
  }, []);

  if (page === "loading")  return <Splash />;
  if (page === "approval") return <Approval />;
  if (page === "welcome")  return <Welcome onCreate={() => setPage("create")} onImport={() => setPage("import")} />;
  if (page === "create")   return <CreateWallet onBack={() => setPage("welcome")} onDone={() => setPage("home")} />;
  if (page === "import")   return <ImportWallet onBack={() => setPage("welcome")} onDone={() => setPage("home")} />;
  return <Home onLogout={() => setPage("welcome")} />;
}

function Splash() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:600, gap:20 }}>
      <GarudaFox size={72} />
      <div style={{ textAlign:"center" }}>
        <p style={{ fontSize:22, fontWeight:800, color:"var(--primary)", letterSpacing:"-.01em" }}>GarudaChain</p>
        <p style={{ fontSize:13, color:"var(--t3)", marginTop:4 }}>Memuat wallet...</p>
      </div>
    </div>
  );
}

/* ── Garuda Fox — maskot seperti MetaMask tapi Garuda Eagle ────────────── */
export function GarudaFox({ size = 48 }: { size?: number }) {
  const s = size;
  return (
    <div style={{ width:s, height:s, position:"relative", flexShrink:0 }}>
      <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
        {/* Body */}
        <ellipse cx="50" cy="58" rx="26" ry="20" fill="#8B0000" />
        {/* Head */}
        <circle cx="50" cy="36" r="18" fill="#8B0000" />
        {/* Beak */}
        <polygon points="50,46 43,52 57,52" fill="#c0392b" />
        {/* Eyes */}
        <circle cx="43" cy="33" r="4" fill="white" />
        <circle cx="57" cy="33" r="4" fill="white" />
        <circle cx="44" cy="33" r="2" fill="#24272a" />
        <circle cx="58" cy="33" r="2" fill="#24272a" />
        <circle cx="45" cy="32" r=".8" fill="white" />
        <circle cx="59" cy="32" r=".8" fill="white" />
        {/* Left wing */}
        <path d="M24 52 Q10 42 12 30 Q20 38 26 46 Z" fill="#a00000" />
        <path d="M24 58 Q6 55 8 44 Q18 50 24 58 Z" fill="#7a0000" />
        {/* Right wing */}
        <path d="M76 52 Q90 42 88 30 Q80 38 74 46 Z" fill="#a00000" />
        <path d="M76 58 Q94 55 92 44 Q82 50 76 58 Z" fill="#7a0000" />
        {/* Crest feathers */}
        <path d="M44 19 Q42 8 46 6 Q48 14 50 18" fill="#c0392b" />
        <path d="M50 18 Q50 6 54 4 Q54 12 52 18" fill="#8B0000" />
        <path d="M56 19 Q58 8 54 6 Q52 14 50 18" fill="#c0392b" />
        {/* Chest pattern */}
        <ellipse cx="50" cy="60" rx="14" ry="12" fill="#c0392b" opacity=".4" />
        {/* Feet */}
        <path d="M40 76 Q36 80 33 82 M40 76 Q40 80 38 83 M40 76 Q43 80 44 83" stroke="#8B0000" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M60 76 Q64 80 67 82 M60 76 Q60 80 62 83 M60 76 Q57 80 56 83" stroke="#8B0000" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
