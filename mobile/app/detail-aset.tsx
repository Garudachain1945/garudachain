import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoAccentBtn, neoBottom,
} from "@/constants/neo";
import { getActiveAccount } from "@/utils/wallet-storage";
import { getAddressInfo, formatGRD, type TxItem } from "@/utils/garuda-api";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const GRD_ASSET = {
  id: "grd", name: "GarudaChain", symbol: "GRD", color: "#C8922A", letter: "G",
};

const TIME_FILTERS = ["1J", "1W", "1M", "3M", "1T", "Semua"];

interface MiniChartProps {
  data: number[];
  color: string;
  height?: number;
}

function MiniChart({ data, color, height = 80 }: MiniChartProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const barW = Math.floor(280 / data.length) - 2;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 2, paddingHorizontal: 4 }}>
      {data.map((val, i) => {
        const barH = Math.max(4, ((val - min) / range) * (height - 4) + 4);
        const isLast = i === data.length - 1;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: barH,
              backgroundColor: isLast ? color : color + "66",
              borderRadius: 3,
            }}
          />
        );
      })}
    </View>
  );
}

interface RecentTx {
  type: string;
  amount: string;
  date: string;
  color: string;
  icon: IoniconName;
}

export default function DetailAsetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const asset = GRD_ASSET;
  const [activeFilter, setActiveFilter] = useState("1M");
  const [walletAddress, setWalletAddress] = useState("");
  const [balanceSatoshi, setBalanceSatoshi] = useState(0);
  const [txHistory, setTxHistory] = useState<TxItem[]>([]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    void (async () => {
      const account = await getActiveAccount();
      if (account) {
        setWalletAddress(account.address);
        try {
          const info = await getAddressInfo(account.address);
          setBalanceSatoshi(info.balance ?? 0);
          setTxHistory(info.transactions ?? []);
        } catch {}
      }
    })();
  }, []);

  const chartData = txHistory.length >= 2
    ? txHistory.slice(0, 10).map((tx) => tx.value + 1).reverse()
    : [10, 30, 20, 50, 40, 60, 45, 70, 55, 80];

  const recentTxs: RecentTx[] = txHistory.slice(0, 3).map((tx) => {
    const isSend = tx.from === walletAddress;
    return {
      type: isSend ? "Kirim" : "Terima",
      amount: `${isSend ? "-" : "+"}${formatGRD(tx.value)} ${asset.symbol}`,
      date: tx.timestamp
        ? new Date(tx.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
        : "—",
      color: isSend ? "#EF4444" : "#22C55E",
      icon: (isSend ? "arrow-forward" : "arrow-down") as IoniconName,
    };
  });

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backBtn, neoRaisedMd]}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: asset.color + "22" }]}>
            <Text style={[styles.headerIconText, { color: asset.color }]}>{asset.letter}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{asset.name}</Text>
            <Text style={styles.headerSymbol}>{asset.symbol}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.starBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={"star-outline" as IoniconName} size={20} color={NEO_MUTED} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.balanceCard, neoRaisedMd]}>
          <Text style={styles.balanceLabel}>Saldo {asset.symbol}</Text>
          <Text style={styles.balanceAmount}>{formatGRD(balanceSatoshi)} {asset.symbol}</Text>
          <Text style={styles.balanceIDR}>Jaringan GarudaChain</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Jaringan</Text>
            <Text style={styles.priceValue}>GarudaChain Mainnet</Text>
          </View>
        </View>

        <View style={[styles.chartCard, neoRaisedMd]}>
          <View style={styles.chartFilters}>
            {TIME_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <MiniChart data={chartData} color={asset.color} height={90} />
          <View style={styles.chartStats}>
            <View>
              <Text style={styles.chartStatLabel}>Total Transaksi</Text>
              <Text style={styles.chartStatValue}>{txHistory.length}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.chartStatLabel}>Saldo Saat Ini</Text>
              <Text style={styles.chartStatValue}>{formatGRD(balanceSatoshi)} GRD</Text>
            </View>
          </View>
        </View>

        <View style={[styles.statsGrid, neoRaisedMd]}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Total Diterima</Text>
            <Text style={[styles.statValue, { color: "#22C55E" }]}>
              {formatGRD(txHistory.filter((tx) => tx.to === walletAddress).reduce((s, tx) => s + tx.value, 0))} GRD
            </Text>
          </View>
          <View style={[styles.statCell, styles.statCellBorder]}>
            <Text style={styles.statLabel}>Total Dikirim</Text>
            <Text style={[styles.statValue, { color: "#EF4444" }]}>
              {formatGRD(txHistory.filter((tx) => tx.from === walletAddress).reduce((s, tx) => s + tx.value, 0))} GRD
            </Text>
          </View>
          <View style={[styles.statCell, styles.statCellTopBorder]}>
            <Text style={styles.statLabel}>Jumlah TX</Text>
            <Text style={styles.statValue}>{txHistory.length}</Text>
          </View>
          <View style={[styles.statCell, styles.statCellBorder, styles.statCellTopBorder]}>
            <Text style={styles.statLabel}>Jaringan</Text>
            <Text style={styles.statValue}>GarudaChain</Text>
          </View>
        </View>

        <View style={[styles.recentCard, neoRaisedMd]}>
          <Text style={styles.recentTitle}>Transaksi Terakhir</Text>
          {recentTxs.length === 0 ? (
            <Text style={[styles.txDate, { padding: 8, textAlign: "center" }]}>Belum ada transaksi</Text>
          ) : recentTxs.map((tx, i) => (
            <View key={i} style={[styles.txRow, i < recentTxs.length - 1 && styles.txRowBorder]}>
              <View style={[styles.txIcon, { backgroundColor: tx.color + "20" }]}>
                <Ionicons name={tx.icon} size={16} color={tx.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txType}>{tx.type}</Text>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
              <Text style={[styles.txAmount, { color: tx.color }]}>{tx.amount}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, neoBottom, { paddingBottom: bottomPad + 12 }]}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.kirimBtn, neoAccentBtn]}
          activeOpacity={0.85}
          onPress={() => router.push("/kirim")}
        >
          <Ionicons name={"arrow-forward" as IoniconName} size={18} color="#ffffff" />
          <Text style={styles.actionBtnText}>Kirim</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.terimaBtn, neoRaisedMd]}
          activeOpacity={0.85}
          onPress={() => router.push("/terima")}
        >
          <Ionicons name={"arrow-down" as IoniconName} size={18} color={NEO_TEXT} />
          <Text style={[styles.actionBtnText, { color: NEO_TEXT }]}>Terima</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerIconText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  headerSymbol: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  starBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  balanceCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 20,
  },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4 },
  balanceAmount: { fontSize: 28, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 4 },
  balanceIDR: { fontSize: 16, fontFamily: "Inter_500Medium", color: NEO_MUTED, marginBottom: 16 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    paddingTop: 14,
  },
  priceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  priceValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  chartCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 16,
  },
  chartFilters: { flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  filterChipActive: { backgroundColor: NEO_ACCENT },
  filterChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  filterChipTextActive: { color: "#ffffff" },
  chartStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  chartStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 3 },
  chartStatValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: NEO_BG,
    borderRadius: 18,
    overflow: "hidden",
  },
  statCell: { width: "50%", padding: 16 },
  statCellBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(0,0,0,0.05)" },
  statCellTopBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 6 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  recentCard: {
    backgroundColor: NEO_BG,
    borderRadius: 18,
    padding: 16,
  },
  recentTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 14 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  txType: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  txAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: NEO_BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 15,
  },
  kirimBtn: { backgroundColor: NEO_ACCENT },
  terimaBtn: { backgroundColor: NEO_BG },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#ffffff" },
});
