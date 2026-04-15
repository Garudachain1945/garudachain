import { Layout } from "@/components/Layout";
import { useGetNetworkStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatNumber } from "@/lib/utils";
import { apiUrl } from "@/lib/api-config";
import { useI18n } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { Building2, BarChart3, Landmark, Shield, ArrowRight } from "lucide-react";

interface StockToken {
  rank: number;
  kode: string;
  nama: string;
  assetId: string;
  totalSupply: number;
  outstanding: number;
  holders: number;
  issueHeight: number;
  issueTxid: string;
  status: string;
}

export function Saham() {
  const { t } = useI18n();
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 15000 } });
  const latestBlock = stats?.latestBlock ?? 0;

  const [stocks, setStocks] = useState<StockToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/blockchain/stocks"))
      .then((r) => r.json())
      .then((data: StockToken[]) => {
        // Deduplicate by kode, keep highest supply
        data.sort((a, b) => (b.totalSupply || 0) - (a.totalSupply || 0));
        const seen = new Set<string>();
        const unique = data.filter(s => { const k = s.kode.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; });
        setStocks(unique);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch(apiUrl("/api/blockchain/stocks"))
        .then((r) => r.json())
        .then(setStocks)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-7 h-7" />
            <h1 className="text-2xl font-bold">{t("saham.title")}</h1>
          </div>
          <p className="text-white/70 text-sm max-w-2xl">
            {t("saham.subtitle")}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("saham.total_stocks")}</p>
            <p className="text-[18px] font-bold text-foreground">{loading ? "..." : stocks.length}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("saham.active_trading")}</p>
            <p className="text-[18px] font-bold text-emerald-600">{loading ? "..." : stocks.filter(s => s.status === "active").length}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Holders</p>
            <p className="text-[18px] font-bold text-foreground">{loading ? "..." : stocks.reduce((sum, s) => sum + s.holders, 0)}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{t("common.block_height")}</p>
            <p className="text-[18px] font-bold text-foreground">{formatNumber(latestBlock)}</p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white border border-border rounded-lg p-5 mb-6">
          <h3 className="text-[14px] font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t("saham.mechanism_title")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: "1", title: t("saham.step1_title"), desc: t("saham.step1_desc") },
              { step: "2", title: t("saham.step2_title"), desc: t("saham.step2_desc") },
              { step: "3", title: t("saham.step3_title"), desc: t("saham.step3_desc") },
              { step: "4", title: t("saham.step4_title"), desc: t("saham.step4_desc") },
            ].map(item => (
              <div key={item.step} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                  {item.step}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keunggulan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Landmark className="w-4 h-4 text-primary" />
              <p className="text-[13px] font-bold text-foreground">{t("saham.adv_instant")}</p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {t("saham.adv_instant_desc")}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <p className="text-[13px] font-bold text-foreground">{t("saham.adv_fractional")}</p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {t("saham.adv_fractional_desc")}
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <p className="text-[13px] font-bold text-foreground">{t("saham.adv_24h")}</p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {t("saham.adv_24h_desc")}
            </p>
          </div>
        </div>

        {/* CTA for Emiten */}
        {/* Table */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-foreground">{t("saham.list_title")}</h3>
            <span className="text-[11px] text-muted-foreground">Data langsung dari blockchain</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("saham.code")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("saham.name")}</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Total Supply</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Holders</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">Issue Block</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading saham dari blockchain...</td>
                  </tr>
                ) : stocks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium mb-1">Belum ada saham yang diterbitkan</p>
                      <p className="text-[12px] text-muted-foreground">
                        Belum ada emiten yang menerbitkan token saham
                      </p>
                    </td>
                  </tr>
                ) : (
                  stocks.map((saham, idx) => (
                    <tr key={saham.kode} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/saham/${saham.kode}`} className="text-primary font-bold hover:underline">
                          {saham.kode}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{saham.nama}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatNumber(saham.totalSupply)}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">{saham.holders}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">#{formatNumber(saham.issueHeight)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {t("saham.status_active")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Regulatory Note */}
        <div className="mt-6 bg-gray-50 border border-border rounded-lg p-4">
          <p className="text-[12px] text-muted-foreground">
            <strong>{t("saham.regulatory_title")}:</strong> {t("saham.disclaimer")}
          </p>
        </div>
      </div>
    </Layout>
  );
}
