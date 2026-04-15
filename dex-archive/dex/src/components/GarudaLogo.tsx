import { cn } from "@/lib/utils";

interface GarudaLogoProps {
  className?: string;
}

export function GarudaLogo({ className }: GarudaLogoProps) {
  return (
    <img
      src="/garuda.svg"
      alt="Garuda Pancasila"
      className={cn("w-10 h-10 object-contain", className)}
    />
  );
}
