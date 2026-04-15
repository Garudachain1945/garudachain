import { Layout } from "@/components/Layout";
import { useGetLatestTransactions, useGetNetworkStats } from "@workspace/api-client-react";
import { truncateHash, formatNumber } from "@/lib/utils";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

interface FlowNode {
  address: string;
  totalIn: number;
  totalOut: number;
  txCount: number;
}

export function TokenFlow() {
  const { data: txs, isLoading: txsLoading } = useGetLatestTransactions(
    { limit: 50 },
    { query: { refetchInterval: 10000 } },
  );
  const { data: stats } = useGetNetworkStats({ query: { refetchInterval: 15000 } });

  const txList = txs && Array.isArray(txs) ? txs : [];

  // Build flow graph from transactions
  const { nodes, links } = useMemo(() => {
    const nodeMap = new Map<string, FlowNode>();

    const getNode = (addr: string): FlowNode => {
      if (!nodeMap.has(addr)) {
        nodeMap.set(addr, { address: addr, totalIn: 0, totalOut: 0, txCount: 0 });
      }
      return nodeMap.get(addr)!;
    };

    const linkList: { from: string; to: string; value: number; hash: string }[] = [];

    for (const tx of txList) {
      const fromAddr = tx.from || "coinbase";
      const toAddr = tx.to || "unknown";
      const value = parseFloat(String(tx.value)) || 0;

      const fromNode = getNode(fromAddr);
      fromNode.totalOut += value;
      fromNode.txCount++;

      if (toAddr !== "unknown") {
        const toNode = getNode(toAddr);
        toNode.totalIn += value;
        toNode.txCount++;
      }

      linkList.push({ from: fromAddr, to: toAddr, value, hash: tx.hash });
    }

    // Sort nodes by total volume
    const sortedNodes = Array.from(nodeMap.values()).sort(
      (a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut)
    );

    return { nodes: sortedNodes.slice(0, 20), links: linkList };
  }, [txList]);

  const topSenders = [...nodes].sort((a, b) => b.totalOut - a.totalOut).slice(0, 10);
  const topReceivers = [...nodes].sort((a, b) => b.totalIn - a.totalIn).slice(0, 10);

  const maxVolume = Math.max(...nodes.map((n) => n.totalIn + n.totalOut), 1);

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold mb-1">Token Flow Visualizer</h1>
            <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded font-semibold">Beta</span>
          </div>
          <p className="text-white/70 text-sm">Visualisasi aliran GRD antar alamat di GarudaChain</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Transaksi Dianalisis</p>
            <p className="text-[18px] font-bold text-foreground">{txList.length}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Alamat Unik</p>
            <p className="text-[18px] font-bold text-foreground">{nodes.length}</p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Flow Volume</p>
            <p className="text-[18px] font-bold text-foreground">
              {formatNumber(links.reduce((sum, l) => sum + l.value, 0))} GRD
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Supply</p>
            <p className="text-[18px] font-bold text-foreground">
              {stats ? `${formatNumber(stats.latestBlock * 0.01)} GRD` : "..."}
            </p>
          </div>
        </div>

        {txsLoading ? (
          <div className="bg-white border border-border rounded-lg p-16 text-center text-muted-foreground">
            Loading transaction data...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Senders */}
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-white">
                <h2 className="text-[15px] font-bold text-foreground">Top Senders (Outflow)</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">Alamat dengan volume pengiriman GRD tertinggi</p>
              </div>
              <div className="divide-y divide-border">
                {topSenders.map((node, idx) => (
                  <div key={node.address} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[11px] font-bold">
                          {idx + 1}
                        </span>
                        {node.address === "coinbase" ? (
                          <span className="text-amber-600 font-semibold text-[13px]">Coinbase (Mining)</span>
                        ) : (
                          <Link href={`/address/${node.address}`} className="text-primary hover:underline font-mono text-[13px]">
                            {truncateHash(node.address, 10, 8)}
                          </Link>
                        )}
                      </div>
                      <span className="text-[12px] font-bold text-red-600">
                        -{formatNumber(Math.round(node.totalOut))} GRD
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-red-400 h-2 rounded-full transition-all"
                          style={{ width: `${Math.max(2, (node.totalOut / maxVolume) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{node.txCount} txn</span>
                    </div>
                  </div>
                ))}
                {topSenders.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">Tidak ada data</div>
                )}
              </div>
            </div>

            {/* Top Receivers */}
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-white">
                <h2 className="text-[15px] font-bold text-foreground">Top Receivers (Inflow)</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">Alamat dengan volume penerimaan GRD tertinggi</p>
              </div>
              <div className="divide-y divide-border">
                {topReceivers.map((node, idx) => (
                  <div key={node.address} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">
                          {idx + 1}
                        </span>
                        {node.address === "coinbase" ? (
                          <span className="text-amber-600 font-semibold text-[13px]">Coinbase</span>
                        ) : (
                          <Link href={`/address/${node.address}`} className="text-primary hover:underline font-mono text-[13px]">
                            {truncateHash(node.address, 10, 8)}
                          </Link>
                        )}
                      </div>
                      <span className="text-[12px] font-bold text-emerald-600">
                        +{formatNumber(Math.round(node.totalIn))} GRD
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-emerald-400 h-2 rounded-full transition-all"
                          style={{ width: `${Math.max(2, (node.totalIn / maxVolume) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{node.txCount} txn</span>
                    </div>
                  </div>
                ))}
                {topReceivers.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">Tidak ada data</div>
                )}
              </div>
            </div>

            {/* Recent Flows Table */}
            <div className="bg-white border border-border rounded-xl overflow-hidden lg:col-span-2">
              <div className="p-4 border-b border-border bg-white">
                <h2 className="text-[15px] font-bold text-foreground">Recent Token Flows</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">Aliran GRD terbaru antar alamat</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gray-50/80 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left">Tx Hash</th>
                      <th className="px-4 py-2.5 text-left">Pengirim</th>
                      <th className="w-8 px-1 py-2.5"></th>
                      <th className="px-4 py-2.5 text-left">Penerima</th>
                      <th className="px-4 py-2.5 text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.slice(0, 20).map((link, idx) => (
                      <tr key={`${link.hash}-${idx}`} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/tx/${link.hash}`} className="text-primary hover:underline font-mono text-[12px]">
                            {truncateHash(link.hash, 10, 6)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          {link.from === "coinbase" ? (
                            <span className="text-amber-600 font-semibold text-[12px]">Coinbase</span>
                          ) : (
                            <Link href={`/address/${link.from}`} className="text-primary hover:underline font-mono text-[12px]">
                              {truncateHash(link.from, 8, 6)}
                            </Link>
                          )}
                        </td>
                        <td className="px-1 py-2.5">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                            <ArrowRight className="w-3 h-3 text-emerald-600" />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {link.to === "unknown" ? (
                            <span className="text-muted-foreground text-[12px]">—</span>
                          ) : (
                            <Link href={`/address/${link.to}`} className="text-primary hover:underline font-mono text-[12px]">
                              {truncateHash(link.to, 8, 6)}
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="font-mono text-[12px] font-medium border border-border bg-gray-50 px-2 py-0.5 rounded">
                            {link.value} GRD
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border bg-gray-50/50">
                <p className="text-xs text-muted-foreground">
                  Menampilkan {Math.min(20, links.length)} flow terbaru dari {links.length} transaksi
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
