import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, ChevronDown } from "lucide-react";
import { search } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

interface SearchBoxProps {
  className?: string;
  size?: "sm" | "lg";
}

function useFilterOptions() {
  const { t } = useI18n();
  return [
    { value: "all", label: t("home.all_filters") },
    { value: "address", label: t("home.filter_address") },
    { value: "transaction", label: t("home.filter_txhash") },
    { value: "block", label: t("home.filter_block") },
    { value: "token", label: t("home.filter_token") },
  ];
}

export function SearchBox({ className, size = "sm" }: SearchBoxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [filter, setFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const trimmed = query.trim();

      // If a specific filter is selected, navigate directly
      if (filter === "block") {
        setLocation(`/block/${trimmed}`);
        return;
      }
      if (filter === "transaction") {
        setLocation(`/tx/${trimmed}`);
        return;
      }
      if (filter === "address") {
        setLocation(`/address/${trimmed}`);
        return;
      }
      if (filter === "token") {
        setLocation(`/tokens?q=${trimmed}`);
        return;
      }

      // "all" — auto-detect via API
      const result = await search({ q: trimmed });

      if (result.type === "block") {
        setLocation(`/block/${trimmed}`);
      } else if (result.type === "transaction") {
        setLocation(`/tx/${trimmed}`);
      } else if (result.type === "address") {
        setLocation(`/address/${trimmed}`);
      } else {
        toast({
          title: "Not Found",
          description: "Could not find any block, transaction, or address matching your query.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Search Error",
        description: "An error occurred while searching the network.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const FILTER_OPTIONS = useFilterOptions();
  const activeLabel = FILTER_OPTIONS.find(o => o.value === filter)?.label ?? t("home.all_filters");

  const placeholders: Record<string, string> = {
    all: t("common.search_placeholder"),
    address: t("home.filter_address") + " (grd1q...)",
    transaction: t("home.filter_txhash"),
    block: t("home.filter_block"),
    token: t("home.filter_token"),
  };

  return (
    <form
      onSubmit={handleSearch}
      className={cn(
        "relative flex items-center w-full bg-white rounded-lg overflow-visible border border-gray-300 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all shadow-sm",
        className
      )}
    >
      <div className="flex items-center w-full">
        {/* Filter dropdown */}
        <div className="relative hidden sm:block" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center px-4 border-r border-gray-300 bg-gray-50 h-full text-[13px] font-medium text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap py-3"
          >
            {activeLabel}
            <ChevronDown className={cn("w-4 h-4 ml-1 opacity-50 transition-transform", filterOpen && "rotate-180")} />
          </button>

          {filterOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setFilter(opt.value); setFilterOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors",
                    filter === opt.value ? "text-primary font-semibold bg-red-50" : "text-gray-700"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholders[filter]}
          className={cn(
            "w-full bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-400 px-4",
            size === "lg" ? "py-3.5 text-[15px]" : "py-2.5 text-sm"
          )}
          disabled={isSearching}
        />

        <div className="pr-1 pl-1 shrink-0 flex items-center h-full">
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className={cn(
              "flex items-center justify-center font-medium transition-all rounded text-white mr-1",
              size === "lg" ? "w-10 h-10" : "w-8 h-8",
              !query.trim() || isSearching
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-primary hover:bg-[#B01030]"
            )}
          >
            {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className={cn(size === "lg" ? "w-5 h-5" : "w-4 h-4")} />}
          </button>
        </div>
      </div>
    </form>
  );
}
