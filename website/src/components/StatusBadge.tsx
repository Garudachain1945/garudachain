import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: "success" | "pending" | "failed" | string }) {
  const variants = {
    success: "bg-success/10 text-success border-success/20",
    pending: "bg-warning/10 text-warning border-warning/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
  };

  const currentVariant = variants[status as keyof typeof variants] || variants.pending;

  return (
    <span className={cn(
      "px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md border",
      currentVariant
    )}>
      {status}
    </span>
  );
}
