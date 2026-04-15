import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { GarudaLogo } from "./GarudaLogo";
import { useHealthCheck } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, Menu, X, Globe } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

function DropdownMenu({ label, items }: { label: string; items: { label: string; href: string; badge?: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="flex items-center gap-1 hover:text-primary transition-colors py-2">
        {label}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 pt-1 w-56 z-50">
          <div className="bg-white border border-border rounded-lg shadow-xl py-1.5">
            {items.map((item, idx) => (
              <Link
                key={`${item.href}-${idx}`}
                href={item.href}
                className="flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-red-50 hover:text-primary transition-colors"
                onClick={() => setOpen(false)}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const { data: health } = useHealthCheck({
    query: { refetchInterval: 30000 },
  });
  const isHealthy = health?.status === "ok";
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { lang, setLang, t } = useI18n();

  const navLinkClass = (href: string) =>
    `hover:text-primary transition-colors py-2 ${location === href ? "text-primary font-semibold" : ""}`;

  const mobileNavLinkClass = (href: string) =>
    `block px-4 py-3 text-[15px] font-medium border-b border-border transition-colors ${
      location === href ? "text-primary bg-red-50/50 font-semibold" : "text-foreground hover:bg-gray-50"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-x-hidden">
      {/* Global Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
        <div className="container mx-auto px-4 h-[68px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <GarudaLogo className="w-9 h-9" />
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[19px] leading-none text-foreground tracking-tight">
                Garuda<span className="text-primary">Chain</span>
              </span>
              <span className="text-[11px] text-muted-foreground font-medium border border-border px-1.5 py-0.5 rounded ml-0.5 bg-gray-50">
                Explorer
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-4 text-[13px] font-medium text-foreground/80">
            <Link href="/" className={navLinkClass("/")}>
              {t("nav.home")}
            </Link>
            <DropdownMenu
              label={t("nav.blockchain")}
              items={[
                { label: t("nav.blocks"), href: "/blocks" },
                { label: t("nav.transactions"), href: "/txs" },
                { label: t("nav.miners"), href: "/miners" },
                { label: t("nav.mining"), href: "/mining" },
                { label: t("nav.network"), href: "/network" },
                { label: t("nav.charts"), href: "/charts" },
              ]}
            />
            <DropdownMenu
              label={t("nav.tokens")}
              items={[
                { label: t("nav.top_tokens"), href: "/tokens" },
                { label: t("nav.token_transfers"), href: "/token-transfers" },
                { label: t("nav.token_flow"), href: "/token-flow", badge: "Beta" },
                { label: t("nav.saham"), href: "/saham", badge: "New" },
                { label: "e-IPO & Presale", href: "/ipo", badge: "New" },
                { label: t("nav.sbn"), href: "/sbn", badge: "New" },
              ]}
            />
            <DropdownMenu
              label="Tokenisasi"
              items={[
                { label: t("nav.dashboard"), href: "/dashboard" },
                { label: t("nav.mint_burn"), href: "/mint-burn" },
                { label: t("nav.whitepaper"), href: "/whitepaper" },
              ]}
            />
            <DropdownMenu
              label="Miner"
              items={[
                { label: "Mining Dashboard", href: "/miner-mining", badge: "Live" },
                { label: "Wallet Explorer", href: "/miner-wallet" },
              ]}
            />
            <Link href="/api-docs" className={navLinkClass("/api-docs")}>
              {t("nav.api")}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === "id" ? "en" : "id")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:bg-gray-50 transition-colors text-[12px] font-semibold"
              title={lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
            >
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">{lang === "id" ? "ID" : "EN"}</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
              <div
                className={`w-2 h-2 rounded-full animate-pulse ${isHealthy ? "bg-emerald-500" : "bg-red-500"}`}
              />
              <span className="text-[12px] font-semibold tracking-wide uppercase hidden sm:inline">
                {isHealthy ? t("nav.mainnet") : t("nav.offline")}
              </span>
            </div>
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-border shadow-lg max-h-[80vh] overflow-y-auto">
            <Link href="/" className={mobileNavLinkClass("/")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.home")}
            </Link>
            <div className="px-4 py-2 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold bg-gray-50">
              {t("nav.blockchain")}
            </div>
            <Link href="/blocks" className={mobileNavLinkClass("/blocks")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.blocks")}
            </Link>
            <Link href="/txs" className={mobileNavLinkClass("/txs")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.transactions")}
            </Link>
            <Link href="/miners" className={mobileNavLinkClass("/miners")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.miners")}
            </Link>
            <Link href="/network" className={mobileNavLinkClass("/network")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.network")}
            </Link>
            <Link href="/mining" className={mobileNavLinkClass("/mining")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.mining")}
            </Link>
            <Link href="/charts" className={mobileNavLinkClass("/charts")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.charts")}
            </Link>
            <div className="px-4 py-2 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold bg-gray-50">
              {t("nav.tokens")}
            </div>
            <Link href="/tokens" className={mobileNavLinkClass("/tokens")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.top_tokens")}
            </Link>
            <Link href="/token-transfers" className={mobileNavLinkClass("/token-transfers")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.token_transfers")}
            </Link>
            <Link href="/token-flow" className={mobileNavLinkClass("/token-flow")} onClick={() => setMobileMenuOpen(false)}>
              <span className="flex items-center gap-2">
                {t("nav.token_flow")}
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">Beta</span>
              </span>
            </Link>
            <Link href="/saham" className={mobileNavLinkClass("/saham")} onClick={() => setMobileMenuOpen(false)}>
              <span className="flex items-center gap-2">
                {t("nav.saham")}
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">New</span>
              </span>
            </Link>
            <Link href="/ipo" className={mobileNavLinkClass("/ipo")} onClick={() => setMobileMenuOpen(false)}>
              <span className="flex items-center gap-2">
                e-IPO & Presale
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">New</span>
              </span>
            </Link>
            <Link href="/sbn" className={mobileNavLinkClass("/sbn")} onClick={() => setMobileMenuOpen(false)}>
              <span className="flex items-center gap-2">
                {t("nav.sbn")}
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">New</span>
              </span>
            </Link>
            <div className="px-4 py-2 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold bg-gray-50">
              Tokenisasi
            </div>
            <Link href="/dashboard" className={mobileNavLinkClass("/dashboard")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.dashboard")}
            </Link>
            <Link href="/mint-burn" className={mobileNavLinkClass("/mint-burn")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.mint_burn")}
            </Link>
            <Link href="/whitepaper" className={mobileNavLinkClass("/whitepaper")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.whitepaper")}
            </Link>
            <div className="px-4 py-2 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold bg-gray-50">
              Miner / Publik
            </div>
            <Link href="/miner-mining" className={mobileNavLinkClass("/miner-mining")} onClick={() => setMobileMenuOpen(false)}>
              <span className="flex items-center gap-2">
                Mining Dashboard
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Live</span>
              </span>
            </Link>
            <div className="px-4 py-2 text-[11px] text-muted-foreground uppercase tracking-wide font-semibold bg-gray-50">
              Developer
            </div>
            <Link href="/api-docs" className={mobileNavLinkClass("/api-docs")} onClick={() => setMobileMenuOpen(false)}>
              {t("nav.api")}
            </Link>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full relative z-10 flex flex-col">{children}</main>

      {/* Footer */}
      <footer className="bg-[#111827] text-white py-12 mt-16">
        <div className="container mx-auto px-4 border-b border-white/10 pb-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <GarudaLogo className="w-10 h-10 drop-shadow-md opacity-90" />
                <div>
                  <p className="font-bold text-xl text-white tracking-wide">{t("footer.title")}</p>
                  <p className="text-sm text-gray-400">{t("footer.subtitle")}</p>
                </div>
              </div>
              <p className="text-[12px] text-gray-500 mt-2">
                1 GRD = Rp 1.000 | Block Reward: 0.01 GRD
              </p>
            </div>

            {/* Blockchain */}
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("nav.blockchain")}</p>
              <div className="space-y-2">
                <Link href="/blocks" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.blocks")}</Link>
                <Link href="/txs" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.transactions")}</Link>
                <Link href="/miners" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.miners")}</Link>
                <Link href="/mining" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.mining")}</Link>
                <Link href="/charts" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.charts")}</Link>
              </div>
            </div>

            {/* Tokenisasi & Assets */}
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Tokenisasi & {t("nav.tokens")}</p>
              <div className="space-y-2">
                <Link href="/saham" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.saham")}</Link>
                <Link href="/ipo" className="block text-sm text-gray-300 hover:text-primary transition-colors">e-IPO & Presale</Link>
                <Link href="/dashboard" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.dashboard")}</Link>
                <Link href="/mint-burn" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.mint_burn")}</Link>
                <Link href="/sbn" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.sbn")}</Link>
              </div>
            </div>

            {/* Miner & Developer */}
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Miner & Developer</p>
              <div className="space-y-2">
                <Link href="/miner-mining" className="block text-sm text-gray-300 hover:text-primary transition-colors">Mining Dashboard</Link>
                <Link href="/api-docs" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.api")}</Link>
                <Link href="/whitepaper" className="block text-sm text-gray-300 hover:text-primary transition-colors">{t("nav.whitepaper")}</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} {t("footer.rights")}</p>
          <p className="mt-2 sm:mt-0 flex items-center gap-1">
            {t("footer.powered")} <span className="text-primary font-bold ml-1">GarudaChain</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
