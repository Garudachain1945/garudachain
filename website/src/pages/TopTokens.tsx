import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { AssetLogo } from "@/components/AssetLogo";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useState, useEffect } from "react";
import { Coins, Globe, BarChart3, Landmark, Layers } from "lucide-react";

// Currency code → country flag emoji
const CURRENCY_COUNTRY: Record<string, string> = {
  EUR: "EU", XAF: "CM", XOF: "SN", XPF: "PF", XCD: "AG", XDR: "UN",
  ANG: "CW", AWG: "AW", SHP: "SH", FKP: "FK", GGP: "GG", JEP: "JE",
  IMP: "IM", TVD: "TV", KID: "KI", ZWL: "ZW",
};
function currencyFlag(code: string): string | null {
  const upper = code.toUpperCase();
  // Skip crypto/non-currency codes (no country flag)
  const cryptos = new Set(["BTC","ETH","ADA","DOT","SOL","AKT","APE","APT","ARB","ATOM","AVAX","AXS","BAT","BCH","BNB","BONK","COMP","CRO","DAI","DOGE","EOS","FET","FIL","FLOKI","FLOW","FTM","GALA","GRT","HBAR","ICP","IMX","INJ","JASMY","JUP","KAS","KERA","LDO","LEO","LINK","LTC","MANA","MATIC","MKR","NEAR","NEO","NOT","OP","PEPE","QNT","RENDER","RUNE","SAND","SEI","SHIB","STX","SUI","TAO","THETA","TIA","TON","TRX","UNI","USDC","USDT","VET","WIF","WLD","XLM","XMR","XRP","ZEC","ZIL","AAVE","ALGO","AMP","CHZ","DASH","DYDX","ENA","ENS","IOTA","MINA","NEXO","ONDO","PENDLE","PYTH","STRK","W","WOO","ZRX","SEMUA","TEPAT"]);
  if (cryptos.has(upper)) return null;
  const cc = CURRENCY_COUNTRY[upper] || upper.slice(0, 2);
  // Convert country code to flag emoji (regional indicator symbols)
  const flag = [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
  return flag;
}

interface TokenData {
  rank: number;
  symbol: string;
  name: string;
  type: string;
  badge: string;
  price: string | null;
  priceStable: boolean;
  totalSupply: number;
  outstanding?: number;
  holders: number;
  transfers: number;
  assetId: string | null;
  issuer: string;
  issueHeight: number;
  issueTxid?: string;
  desc: string;
}

interface OracleRate {
  symbol: string;
  grd_per_unit: number;
  units_per_grd: number;
}

interface StablecoinData {
  symbol: string;
  name: string;
  assetId: string;
  oracleGrdPerUnit: number;
  oracleUnitsPerGrd: number;
  orderbookPrice: number;
  orderbookBestAsk: number;
  orderbookBestBid: number;
  spreadPercent: number;
  totalSupply: number;
  holders: number;
}

type FilterTab = "semua" | "blockchain" | "stablecoin" | "stablecoin-world" | "saham";

const TABS: { key: FilterTab; label: string; icon: any }[] = [
  { key: "semua", label: "Semua", icon: Layers },
  { key: "blockchain", label: "Blockchain", icon: Coins },
  { key: "stablecoin", label: "Stablecoin", icon: Landmark },
  { key: "stablecoin-world", label: "Stablecoin World", icon: Globe },
  { key: "saham", label: "Pasar Saham", icon: BarChart3 },
];

export function TopTokens() {
  const { data: stats, isLoading } = useGetNetworkStats({
    query: { refetchInterval: 15000 },
  });

  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("semua");
  const [oracleRates, setOracleRates] = useState<OracleRate[]>([]);
  const [stablecoins, setStablecoins] = useState<StablecoinData[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/blockchain/tokens"))
      .then((r) => r.json())
      .then((data) => { setTokens(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(apiUrl("/api/oracle/rates"))
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setOracleRates(data); })
      .catch(() => {});

    fetch(apiUrl("/api/blockchain/stablecoins"))
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStablecoins(data); })
      .catch(() => {});

    const iv = setInterval(() => {
      fetch(apiUrl("/api/blockchain/tokens")).then((r) => r.json()).then(setTokens).catch(() => {});
      fetch(apiUrl("/api/oracle/rates")).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setOracleRates(d); }).catch(() => {});
      fetch(apiUrl("/api/blockchain/stablecoins")).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setStablecoins(d); }).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  // Build set of oracle currency symbols (to separate currencies from real stock assets)
  const oracleCurrencySet = new Set(oracleRates.map((r) => r.symbol.toUpperCase()));

  // Check if a token is a pegged currency (e.g. pGBP→GBP, pJPY→JPY) or direct currency match
  const isPeggedCurrency = (symbol: string): boolean => {
    const upper = symbol.toUpperCase();
    if (oracleCurrencySet.has(upper)) return true;
    if (upper.startsWith("P") && upper.length > 1 && oracleCurrencySet.has(upper.slice(1))) return true;
    return false;
  };

  // Pegged currency tokens from blockchain (pGBP, pSDG, etc.) — shown in Stablecoin Dunia
  const peggedTokens = tokens.filter((t) => !t.priceStable && t.type !== "NATIVE" && isPeggedCurrency(t.symbol));

  // Filter tokens by category
  const filteredTokens = tokens.filter((t) => {
    if (activeTab === "semua") return true;
    if (activeTab === "blockchain") return t.type === "NATIVE";
    if (activeTab === "stablecoin") return t.priceStable;
    // Pasar Saham: only real company/stock assets — exclude native, stablecoins, and pegged currencies
    if (activeTab === "saham") return !t.priceStable && t.type !== "NATIVE" && !isPeggedCurrency(t.symbol);
    return false;
  });

  // Oracle rate map
  const oracleMap = new Map(oracleRates.map((r) => [r.symbol.toUpperCase(), r]));
  // Stablecoin data map
  const scMap = new Map(stablecoins.map((s) => [(s.symbol || "").toUpperCase(), s]));
  // Pegged token map: base currency symbol → token (e.g. GBP → pGBP token)
  const peggedBaseMap = new Map(peggedTokens.map((t) => {
    const base = t.symbol.toUpperCase().startsWith("P") ? t.symbol.slice(1).toUpperCase() : t.symbol.toUpperCase();
    return [base, t];
  }));
  // Set of currency symbols that have a real blockchain token (direct stablecoin or pegged)
  const stablecoinSymbolSet = new Set<string>();
  tokens.forEach((t) => {
    if (t.priceStable) stablecoinSymbolSet.add(t.symbol.toUpperCase());
  });
  peggedTokens.forEach((t) => {
    const base = t.symbol.toUpperCase().startsWith("P") ? t.symbol.slice(1).toUpperCase() : t.symbol.toUpperCase();
    stablecoinSymbolSet.add(base);
  });

  // Count per category
  const countBlockchain = tokens.filter((t) => t.type === "NATIVE").length;
  const countStablecoin = tokens.filter((t) => t.priceStable).length;
  const countSaham = tokens.filter((t) => !t.priceStable && t.type !== "NATIVE" && !isPeggedCurrency(t.symbol)).length;

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-1">
            <Coins className="w-6 h-6" />
            <h1 className="text-xl font-bold">Pelacak Token</h1>
          </div>
          <p className="text-white/70 text-sm">Semua token di jaringan GarudaChain Mainnet</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Tinggi Blok", value: isLoading ? "..." : formatNumber(stats?.latestBlock ?? 0) },
            { label: "Total Transaksi", value: isLoading ? "..." : formatNumber(stats?.totalTransactions ?? 0) },
            { label: "Jumlah Token Total", value: loading ? "..." : tokens.length.toString() },
            { label: "Jaringan", value: "Jaringan Utama GarudaChain" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-border rounded-lg p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{s.label}</p>
              <p className="text-[15px] font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = tab.key === "semua" ? tokens.length
              : tab.key === "blockchain" ? countBlockchain
              : tab.key === "stablecoin" ? countStablecoin
              : tab.key === "stablecoin-world" ? oracleRates.filter((r) => stablecoinSymbolSet.has(r.symbol.toUpperCase())).length + peggedTokens.length
              : countSaham;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all border ${
                  activeTab === tab.key
                    ? "bg-[#8B0000] text-white border-[#8B0000] shadow-sm"
                    : "bg-white text-muted-foreground border-border hover:bg-gray-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-muted-foreground"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Stablecoin World Tab - Oracle Rates + Pegged Tokens in ONE table */}
        {activeTab === "stablecoin-world" ? (
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-gray-50/80 flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                Kurs Oracle Real-Time — {oracleRates.filter((r) => stablecoinSymbolSet.has(r.symbol.toUpperCase())).length} Mata Uang · {peggedTokens.length} Token Blockchain
              </p>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] text-emerald-600 font-semibold">Live per detik</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Mata Uang</th>
                    <th className="px-4 py-3 text-right">Harga Oracle (GRD)</th>
                    <th className="px-4 py-3 text-right">1 GRD =</th>
                    <th className="px-4 py-3 text-right">Harga Orderbook (GRD)</th>
                    <th className="px-4 py-3 text-right">Spread</th>
                    <th className="px-4 py-3 text-right">Pasokan Blockchain</th>
                  </tr>
                </thead>
                <tbody>
                  {oracleRates.filter((r) => stablecoinSymbolSet.has(r.symbol.toUpperCase())).length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Memuat kurs oracle...</td></tr>
                  ) : (
                    oracleRates.filter((r) => stablecoinSymbolSet.has(r.symbol.toUpperCase())).map((rate, i) => {
                      const sym = rate.symbol.toUpperCase();
                      const sc = scMap.get(sym);
                      const obPrice = sc?.orderbookPrice ?? 0;
                      const spread = sc?.spreadPercent ?? 0;
                      const hasOb = obPrice > 0;
                      const directToken = tokens.find((t) => t.symbol.toUpperCase() === sym && t.priceStable);
                      const pegToken = peggedBaseMap.get(sym);
                      const chainToken = directToken || pegToken;
                      return (
                        <tr key={rate.symbol} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground font-mono text-[12px]">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {(() => {
                                const flag = currencyFlag(rate.symbol);
                                return flag ? (
                                  <span className="text-[22px] leading-none shrink-0">{flag}</span>
                                ) : (
                                  <AssetLogo symbol={rate.symbol} size={30} tipe="STABLECOIN" />
                                );
                              })()}
                              <div>
                                <Link href={`/oracle/${rate.symbol}`} className="text-primary hover:underline font-semibold text-[13px]">
                                  {rate.symbol}
                                </Link>
                                {chainToken && (
                                  <p className="text-[10px] text-muted-foreground">{chainToken.name.replace(/[^\w\s]/g, "").trim()}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12px] text-emerald-600 font-semibold">
                            {rate.grd_per_unit.toFixed(8)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12px] text-muted-foreground">
                            {rate.units_per_grd.toFixed(4)} {rate.symbol}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12px]">
                            {hasOb ? (
                              <span className="text-blue-600 font-semibold">{obPrice.toFixed(8)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12px]">
                            {hasOb ? (
                              <span className={`font-semibold ${spread >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {spread >= 0 ? "+" : ""}{spread.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12px]">
                            {chainToken ? (
                              <span className="text-foreground font-medium">{formatNumber(chainToken.totalSupply)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Token Table for other tabs */
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50/80 text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Token</th>
                    <th className="px-4 py-3 text-right">Harga</th>
                    {activeTab === "stablecoin" && <th className="px-4 py-3 text-right">Harga Orderbook</th>}
                    {activeTab === "stablecoin" && <th className="px-4 py-3 text-right">Spread</th>}
                    <th className="px-4 py-3 text-right">Pasokan Total</th>
                    <th className="px-4 py-3 text-right">Pemegang</th>
                    <th className="px-4 py-3 text-right">Transfer</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Memuat token dari blockchain...</td>
                    </tr>
                  ) : filteredTokens.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Tidak ada token ditemukan</td>
                    </tr>
                  ) : (
                    filteredTokens.map((token, idx) => {
                      const sc = scMap.get(token.symbol.toUpperCase());
                      const oracle = oracleMap.get(token.symbol.toUpperCase());
                      const obPrice = sc?.orderbookPrice ?? 0;
                      const spread = sc?.spreadPercent ?? 0;
                      return (
                        <tr key={token.rank} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-4 text-muted-foreground font-mono text-[12px]">{idx + 1}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              {(() => {
                                const flag = token.priceStable ? currencyFlag(token.symbol) : null;
                                return flag ? (
                                  <span className="text-[28px] leading-none shrink-0">{flag}</span>
                                ) : (
                                  <AssetLogo
                                    symbol={token.symbol}
                                    size={36}
                                    tipe={token.symbol === "GRD" ? "NATIVE" : token.priceStable ? "STABLECOIN" : "SAHAM"}
                                  />
                                );
                              })()}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <Link href={`/token/${token.symbol}`} className="text-primary hover:underline font-medium text-[13px]">
                                    {token.name}
                                  </Link>
                                  <VerifiedBadge type={token.type} transfers={token.transfers} size={20} />
                                </div>
                                <p className="text-[11px] text-muted-foreground">{token.desc}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[12px]">
                            {token.priceStable ? (
                              <div>
                                <span className="text-emerald-600 font-semibold">{token.price}</span>
                                {oracle && (
                                  <p className="text-[10px] text-muted-foreground">Oracle</p>
                                )}
                              </div>
                            ) : token.price ?? "—"}
                          </td>
                          {activeTab === "stablecoin" && (
                            <td className="px-4 py-4 text-right font-mono text-[12px]">
                              {obPrice > 0 ? (
                                <span className="text-blue-600 font-semibold">{obPrice.toFixed(8)} GRD</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          )}
                          {activeTab === "stablecoin" && (
                            <td className="px-4 py-4 text-right font-mono text-[12px]">
                              {obPrice > 0 ? (
                                <span className={`font-semibold ${spread >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {spread >= 0 ? "+" : ""}{spread.toFixed(2)}%
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-4 text-right font-mono text-[12px] text-foreground font-medium">
                            {token.symbol === "GRD"
                              ? `${formatNumber(token.totalSupply)} GRD`
                              : formatNumber(token.totalSupply)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[12px] text-muted-foreground">
                            {token.holders > 0 ? formatNumber(token.holders) : "—"}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[12px] text-muted-foreground">
                            {token.transfers > 0 ? formatNumber(token.transfers) : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
