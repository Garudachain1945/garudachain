import { Layout } from "@/components/Layout";
import { useGetTransactionByHash } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatTimeAgo } from "@/lib/utils";
import { ArrowRight, CheckCircle, XCircle, Clock } from "lucide-react";

export function TransactionDetail() {
  const params = useParams<{ hash: string }>();
  const { data: tx, isLoading, isError } = useGetTransactionByHash(params.hash || "", {
    query: { enabled: !!params.hash },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-xl font-bold mb-1">Transaction Detail</h1>
            <p className="text-white/70 text-sm">Memuat data transaksi...</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-20 flex justify-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (isError || !tx) {
    return (
      <Layout>
        <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-xl font-bold mb-1">Transaction Not Found</h1>
            <p className="text-white/70 text-sm">Transaksi tidak ditemukan di GarudaChain</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Transaksi dengan hash tersebut tidak ditemukan.</p>
          <Link href="/" className="text-primary hover:underline text-sm mt-4 inline-block">
            Kembali ke Beranda
          </Link>
        </div>
      </Layout>
    );
  }

  const statusIcon = tx.status === "success"
    ? <CheckCircle className="w-4 h-4 text-emerald-600" />
    : tx.status === "failed"
      ? <XCircle className="w-4 h-4 text-red-500" />
      : <Clock className="w-4 h-4 text-amber-500" />;

  const statusColor = tx.status === "success"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tx.status === "failed"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <Layout>
      <div className="bg-gradient-to-r from-[#8B0000] to-[#C00020] text-white py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold mb-1">Transaction Detail</h1>
          <p className="text-white/70 text-sm font-mono text-[12px] break-all">{tx.hash}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex-1">
        {/* Overview */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border bg-gray-50/80">
            <h2 className="text-sm font-bold text-foreground">Overview</h2>
          </div>
          <div className="divide-y divide-border/50">
            <DetailRow label="Transaction Hash" value={
              <span className="font-mono text-[12px] break-all">{tx.hash}</span>
            } />
            <DetailRow label="Status" value={
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[12px] font-semibold ${statusColor}`}>
                {statusIcon}
                {tx.status === "success" ? "Success" : tx.status === "failed" ? "Failed" : "Pending"}
              </span>
            } />
            <DetailRow label="Block" value={
              <Link href={`/block/${tx.blockNumber}`} className="text-primary hover:underline font-mono text-[12px]">
                {tx.blockNumber}
              </Link>
            } />
            <DetailRow label="Timestamp" value={
              <span>
                {formatTimeAgo(tx.timestamp)}
                <span className="text-muted-foreground ml-2 text-[11px]">
                  ({new Date(tx.timestamp).toLocaleString("id-ID")})
                </span>
              </span>
            } />
          </div>
        </div>

        {/* Transfer Info */}
        <div className="bg-white border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border bg-gray-50/80">
            <h2 className="text-sm font-bold text-foreground">Transfer</h2>
          </div>
          <div className="divide-y divide-border/50">
            <DetailRow label="From" value={
              tx.from === "coinbase" ? (
                <span className="text-amber-600 font-semibold text-[13px]">Coinbase (Block Reward Mining)</span>
              ) : (
                <Link href={`/address/${tx.from}`} className="text-primary hover:underline font-mono text-[12px]">
                  {tx.from}
                </Link>
              )
            } />
            <div className="flex items-center px-4 py-2">
              <div className="sm:w-[200px] flex-shrink-0" />
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <ArrowRight className="w-3 h-3 text-emerald-600" />
              </div>
            </div>
            <DetailRow label="To" value={
              tx.to ? (
                <Link href={`/address/${tx.to}`} className="text-primary hover:underline font-mono text-[12px]">
                  {tx.to}
                </Link>
              ) : (
                <span className="text-muted-foreground text-[12px]">—</span>
              )
            } />
            <DetailRow label="Value" value={
              <span className="font-bold text-foreground">
                {tx.value} <span className="text-muted-foreground font-normal">GRD</span>
              </span>
            } />
            <DetailRow label="Transaction Fee" value={
              <span className="text-muted-foreground">{tx.fee}</span>
            } />
          </div>
        </div>

        {/* Technical Details */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gray-50/80">
            <h2 className="text-sm font-bold text-foreground">Detail Teknis</h2>
          </div>
          <div className="divide-y divide-border/50">
            {tx.blockHash && (
              <DetailRow label="Block Hash" value={
                <span className="font-mono text-[12px] break-all">{tx.blockHash}</span>
              } />
            )}
            {tx.gasUsed !== undefined && (
              <DetailRow label="Gas Used" value={tx.gasUsed.toLocaleString()} />
            )}
            {tx.gasPrice && (
              <DetailRow label="Gas Price" value={tx.gasPrice} />
            )}
            {tx.nonce !== undefined && (
              <DetailRow label="Nonce" value={tx.nonce.toString()} />
            )}
            {tx.data && tx.data !== "0x" && (
              <DetailRow label="Input Data" value={
                <div className="bg-gray-50 border border-border rounded p-3 font-mono text-[11px] text-muted-foreground break-all max-h-24 overflow-y-auto">
                  {tx.data}
                </div>
              } />
            )}
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
