/**
 * VerifiedBadge — tanda verifikasi token
 *
 * Gold   : GRD (permanen) | SAHAM dengan 1.000.000+ transfers
 * Blue   : Stablecoin (permanen) | SAHAM dengan 100.000+ transfers
 * Grey   : SAHAM baru listing (< 100.000 transfers)
 */

interface VerifiedBadgeProps {
  type: "NATIVE" | "STABLECOIN" | "SAHAM" | string;
  transfers?: number;
  size?: number;
  className?: string;
}

function getBadge(type: string, transfers: number): "gold" | "biru" | "abu" {
  if (type === "NATIVE") return "gold";
  if (type === "STABLECOIN") return "biru";
  // SAHAM: berbasis jumlah transfer
  if (transfers >= 1_000_000) return "gold";
  if (transfers >= 100_000) return "biru";
  return "abu";
}

export function VerifiedBadge({ type, transfers = 0, size = 16, className = "" }: VerifiedBadgeProps) {
  const badge = getBadge(type.toUpperCase(), transfers);
  const src = `/badge-${badge}.png`;

  const title =
    badge === "gold"
      ? type === "NATIVE"
        ? "GRD — Native Coin GarudaChain"
        : "Platinum Verified (1M+ Transfers)"
      : badge === "biru"
      ? type === "STABLECOIN"
        ? "Stablecoin Resmi GarudaChain"
        : "Verified (100K+ Transfers)"
      : "Terdaftar di GarudaChain";

  return (
    <img
      src={src}
      alt={title}
      title={title}
      width={size}
      height={size}
      className={`shrink-0 inline-block ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
