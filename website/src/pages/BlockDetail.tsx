import { Layout } from "@/components/Layout";
import { useGetBlockByNumber } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatTimeAgo, truncateHash } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export function BlockDetail() {
  const params = useParams<{ blockNumber: string }>();
  const { data: block, isLoading, isError } = useGetBlockByNumber(params.blockNumber || "", {
    query: { enabled: !!params.blockNumber },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-xl font-bold mb-1">Block Detail</h1>
            <p className="text-white/70 text-sm">Memuat data block...</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-20 flex justify-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (isError || !block) {
    return (
      <Layout>
        <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-xl font-bold mb-1">Block Not Found</h1>
            <p className="text-white/70 text-sm">Block tidak ditemukan di GarudaChain</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Block #{params.blockNumber} tidak ditemukan di jaringan.</p>
          <Link href="/" className="text-primary hover:underline text-sm mt-4 inline-block">
            Kembali ke Beranda
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold mb-1">
            Block <span className="text-white/90">#{block.number}</span>
          </h1>
          <p className="text-white/70 text-sm">Detail block di GarudaChain Mainnet</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Block Overview */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border bg-gray-50/80">
            <h2 className="text-sm font-bold text-foreground">Overview</h2>
          </div>
          <div className="divide-y divide-border/50">
            <DetailRow label="Block Height" value={block.number.toLocaleString()} />
            <DetailRow label="Timestamp" value={
              <span>
                {formatTimeAgo(block.timestamp)}
                <span className="text-muted-foreground ml-2 text-[11px]">
                  ({new Date(block.timestamp).toLocaleString("id-ID")})
                </span>
              </span>
            } />
            <DetailRow label="Transactions" value={
              <span className="text-primary font-medium">
                {block.transactionCount} transaksi
              </span>
            } />
            <DetailRow label="Miner / Validator" value={
              block.validator ? (
                <Link href={`/address/${block.validator}`} className="text-primary hover:underline font-mono text-[12px]">
                  {block.validator}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            } />
            <DetailRow label="Block Hash" value={
              <span className="font-mono text-[12px] break-all">{block.hash}</span>
            } />
            <DetailRow label="Parent Hash" value={
              block.number > 0 ? (
                <Link href={`/block/${block.number - 1}`} className="text-primary hover:underline font-mono text-[12px] break-all">
                  {block.parentHash}
                </Link>
              ) : (
                <span className="font-mono text-[12px] text-muted-foreground">Genesis Block</span>
              )
            } />
            <DetailRow label="Size" value={`${block.size.toLocaleString()} bytes`} />
            <DetailRow label="Gas Used" value={
              <span>
                {block.gasUsed.toLocaleString()}
                {block.gasLimit > 0 && (
                  <span className="text-muted-foreground ml-2 text-[11px]">
                    ({((block.gasUsed / block.gasLimit) * 100).toFixed(1)}% of {block.gasLimit.toLocaleString()})
                  </span>
                )}
              </span>
            } />
            <DetailRow label="Block Reward" value={
              <span className="font-medium">0.01 GRD (= Rp 10)</span>
            } />
          </div>
        </div>

        {/* Transactions in Block */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gray-50/80">
            <h2 className="text-sm font-bold text-foreground">
              Transactions <span className="text-muted-foreground font-normal">({block.transactionCount})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/40 text-[12px] text-muted-foreground font-semibold uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">Tx Hash</th>
                  <th className="px-3 py-3 text-left">Dari</th>
                  <th className="w-6 px-1 py-3"></th>
                  <th className="px-3 py-3 text-left">Ke</th>
                  <th className="px-3 py-3 text-right">Nilai</th>
                  <th className="px-3 py-3 text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {block.transactions && block.transactions.length > 0 ? (
                  block.transactions.map((tx) => (
                    <tr key={tx.hash} className="border-b border-border/50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-3 py-3">
                        <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline font-mono text-[12px]">
                          {truncateHash(tx.hash, 10, 6)}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {tx.from === "coinbase" ? (
                          <span className="text-amber-600 font-semibold text-[12px]">Coinbase (Mining)</span>
                        ) : (
                          <Link href={`/address/${tx.from}`} className="text-primary hover:underline font-mono text-[12px]">
                            {truncateHash(tx.from, 6, 4)}
                          </Link>
                        )}
                      </td>
                      <td className="px-1 py-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                          <ArrowRight className="w-3 h-3 text-emerald-600" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {tx.to ? (
                          <Link href={`/address/${tx.to}`} className="text-primary hover:underline font-mono text-[12px]">
                            {truncateHash(tx.to, 6, 4)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-[12px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[12px] font-medium">
                        {tx.value} <span className="text-muted-foreground">GRD</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[12px] text-muted-foreground">
                        {tx.fee}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Tidak ada transaksi di block ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row px-4 py-3 gap-1 sm:gap-0">
      <div className="sm:w-[200px] text-[12px] text-muted-foreground font-medium flex-shrink-0">{label}:</div>
      <div className="text-[13px] text-foreground flex-1 min-w-0">{value}</div>
    </div>
  );
}
