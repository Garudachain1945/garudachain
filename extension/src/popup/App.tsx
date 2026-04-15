import { useState, useEffect } from "react";
import { Welcome }           from "./pages/Welcome";
import { CreateWallet }      from "./pages/CreateWallet";
import { ImportWallet }      from "./pages/ImportWallet";
import { Home }              from "./pages/Home";
import { Approval }          from "./pages/Approval";
import { Send }              from "./pages/Send";
import { Receive }           from "./pages/Receive";
import { DetailAset }        from "./pages/DetailAset";
import { Keamanan }          from "./pages/Keamanan";
import { Notifikasi }        from "./pages/Notifikasi";
import { Profil }            from "./pages/Profil";
import { BukuAlamat }        from "./pages/BukuAlamat";
import { ImportAkunFrasa }   from "./pages/ImportAkunFrasa";
import { ImportKunciPrivat } from "./pages/ImportKunciPrivat";

type Page =
  | "loading" | "welcome" | "create" | "import" | "home" | "approval"
  | "send" | "receive" | "detail-aset" | "keamanan" | "notifikasi"
  | "profil" | "buku-alamat" | "import-frasa" | "import-privat";

function msg(method: string, params?: unknown): Promise<any> {
  return new Promise(r => chrome.runtime.sendMessage({ method, params }, r));
}

export function App() {
  const [page, setPage] = useState<Page>("loading");
  const isApprovalPopup = !!new URLSearchParams(window.location.search).get("approval");

  useEffect(() => {
    const aid = new URLSearchParams(window.location.search).get("approval");

    const checkPending = async () => {
      // Check if there's a pending approval (either from URL or background)
      if (aid) {
        const unlocked = await msg("wallet_isUnlocked");
        if (unlocked?.result) {
          setPage("approval");
        } else {
          const vault = await msg("wallet_hasVault");
          setPage(vault?.result ? "home" : "welcome");
        }
        return;
      }

      // Even without URL param, check if background has a pending request
      const anyPending = await msg("get_any_pending");
      if (anyPending?.result) {
        const unlocked = await msg("wallet_isUnlocked");
        if (unlocked?.result) {
          setPage("approval");
          return;
        }
        // Wallet locked — show home (unlock screen), then redirect to approval
        const vault = await msg("wallet_hasVault");
        setPage(vault?.result ? "home" : "welcome");
        return;
      }

      const vault = await msg("wallet_hasVault");
      setPage(vault?.result ? "home" : "welcome");
    };

    checkPending();
  }, []);

  const handleWalletReady = async () => {
    // After unlock, check if there's a pending approval to show
    const anyPending = await msg("get_any_pending");
    if (isApprovalPopup || anyPending?.result) {
      setPage("approval");
    } else {
      setPage("home");
    }
  };

  const goHome = () => setPage("home");

  if (page === "loading")       return <Splash />;
  if (page === "approval")      return <Approval />;
  if (page === "welcome")       return <Welcome onCreate={() => setPage("create")} onImport={() => setPage("import")} />;
  if (page === "create")        return <CreateWallet onBack={() => setPage("welcome")} onDone={handleWalletReady} />;
  if (page === "import")        return <ImportWallet onBack={() => setPage("welcome")} onDone={handleWalletReady} />;
  if (page === "send")          return <Send onBack={goHome} />;
  if (page === "receive")       return <Receive onBack={goHome} />;
  if (page === "detail-aset")   return <DetailAset onBack={goHome} onSend={() => setPage("send")} onReceive={() => setPage("receive")} />;
  if (page === "keamanan")      return <Keamanan onBack={goHome} onLogout={() => setPage("welcome")} />;
  if (page === "notifikasi")    return <Notifikasi onBack={goHome} />;
  if (page === "profil")        return <Profil onBack={goHome} onLogout={() => setPage("welcome")} />;
  if (page === "buku-alamat")   return <BukuAlamat onBack={goHome} />;
  if (page === "import-frasa")  return <ImportAkunFrasa onBack={goHome} onDone={goHome} />;
  if (page === "import-privat") return <ImportKunciPrivat onBack={goHome} onDone={goHome} />;

  return (
    <Home
      onLogout={() => setPage("welcome")}
      onSend={() => setPage("send")}
      onReceive={() => setPage("receive")}
      onUnlocked={async () => {
        const anyPending = await msg("get_any_pending");
        if (isApprovalPopup || anyPending?.result) setPage("approval");
      }}
      onNavigate={setPage as (p: string) => void}
    />
  );
}

function Splash() {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      height:600, gap:12, background:"var(--neo-bg)",
    }}>
      <div style={{
        width:96, height:96, borderRadius:48, background:"var(--neo-bg)",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:"var(--neo-shadow-lg)",
      }}>
        <img src="/images/garuda.png" alt="Garuda" style={{
          width:64, height:64, objectFit:"contain",
        }} className="garuda-gold" />
      </div>
      <p style={{ fontSize:26, fontWeight:700, color:"var(--neo-text)", letterSpacing:"-.5px" }}>Dompet Digital</p>
      <p style={{ fontSize:13, color:"var(--neo-muted)" }}>GarudaChain</p>
    </div>
  );
}
