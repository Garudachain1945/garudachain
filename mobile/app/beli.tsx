import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd,
} from "@/constants/neo";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const OPTIONS = [
  {
    icon: "people-outline" as IoniconName,
    color: "#C8922A",
    title: "P2P Exchange",
    desc: "Beli GRD langsung dari sesama pengguna. Harga terbaik, pembayaran beragam.",
    badge: "Direkomendasikan",
    badgeColor: "#22C55E",
    route: "/beranda",
  },
  {
    icon: "swap-horizontal-outline" as IoniconName,
    color: "#627EEA",
    title: "Kirim & Terima GRD",
    desc: "Minta GRD dari pengguna lain dengan berbagi alamat dompet Anda.",
    badge: null,
    badgeColor: "",
    route: "/terima",
  },
];

export default function BeliScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backBtn, neoRaisedMd]}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dapatkan GRD</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Hero */}
        <View style={[styles.heroCard, neoRaisedMd]}>
          <View style={[styles.heroIcon, { backgroundColor: NEO_ACCENT + "20" }]}>
            <Text style={styles.heroLetter}>G</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>GarudaChain (GRD)</Text>
            <Text style={styles.heroDesc}>Token asli jaringan GarudaChain</Text>
          </View>
          <View style={styles.networkBadge}>
            <Text style={styles.networkBadgeText}>Mainnet</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Cara Mendapatkan GRD</Text>

        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.title}
            style={[styles.optionCard, neoRaisedMd]}
            activeOpacity={0.82}
            onPress={() => router.push(opt.route as any)}
          >
            <View style={[styles.optionIcon, { backgroundColor: opt.color + "20" }]}>
              <Ionicons name={opt.icon} size={26} color={opt.color} />
            </View>
            <View style={styles.optionBody}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                {opt.badge && (
                  <View style={[styles.badge, { backgroundColor: opt.badgeColor + "20" }]}>
                    <Text style={[styles.badgeText, { color: opt.badgeColor }]}>{opt.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.optionDesc}>{opt.desc}</Text>
            </View>
            <Ionicons name={"chevron-forward" as IoniconName} size={18} color={NEO_MUTED} />
          </TouchableOpacity>
        ))}

        {/* Info card */}
        <View style={[styles.infoCard, neoRaisedMd]}>
          <Ionicons name={"information-circle-outline" as IoniconName} size={18} color={NEO_ACCENT} />
          <Text style={styles.infoText}>
            GRD adalah token utilitas jaringan GarudaChain. Digunakan untuk biaya transaksi dan aktivitas di ekosistem GarudaChain.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  heroCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: NEO_BG, borderRadius: 18, padding: 16,
  },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  heroLetter: { fontSize: 22, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  heroTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  heroDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 2 },
  networkBadge: { backgroundColor: NEO_ACCENT + "20", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  networkBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    letterSpacing: 0.6, textTransform: "uppercase", marginTop: 4,
  },
  optionCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: NEO_BG, borderRadius: 18, padding: 16,
  },
  optionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  optionBody: { flex: 1 },
  optionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  optionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  optionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 18 },
  infoCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: NEO_ACCENT + "10", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: NEO_ACCENT + "25",
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 19 },
});
