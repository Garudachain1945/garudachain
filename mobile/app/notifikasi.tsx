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
  neoRaisedMd,
} from "@/constants/neo";
import { getActiveAccount } from "@/utils/wallet-storage";
import { getAddressInfo, formatGRD, type TxItem } from "@/utils/garuda-api";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface Notif {
  id: string;
  category: "transaksi" | "sistem";
  icon: IoniconName;
  iconColor: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const CATEGORIES = ["Semua", "Transaksi", "Sistem"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

function txToNotif(tx: TxItem, walletAddress: string): Notif {
  const isSend = tx.from === walletAddress;
  const amount = formatGRD(tx.value);
  const date = tx.timestamp
    ? new Date(tx.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
  const short = (addr: string) => addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : "—";
  return {
    id: tx.txid,
    category: "transaksi",
    icon: isSend ? "arrow-up-circle" : "arrow-down-circle",
    iconColor: isSend ? "#EF4444" : "#22C55E",
    title: isSend ? "GRD Terkirim" : "GRD Diterima",
    body: isSend
      ? `${amount} GRD dikirim ke ${short(tx.to)}. Fee: ${formatGRD(tx.fee)} GRD`
      : `+${amount} GRD diterima dari ${short(tx.from)}`,
    time: date,
    read: true,
  };
}

export default function NotifikasiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("Semua");
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const account = await getActiveAccount();
      if (account) {
        try {
          const info = await getAddressInfo(account.address);
          const txNotifs = (info.transactions ?? []).map((tx) => txToNotif(tx, account.address));
          // Mark the most recent 3 as unread
          txNotifs.forEach((n, i) => { if (i < 3) n.read = false; });
          const systemNotifs: Notif[] = [
            {
              id: "sys-welcome",
              category: "sistem",
              icon: "shield-checkmark",
              iconColor: NEO_ACCENT,
              title: "Selamat datang di GarudaChain",
              body: "Dompet Anda berhasil dibuat. Simpan frasa pemulihan di tempat yang aman.",
              time: "—",
              read: true,
            },
          ];
          setNotifs([...txNotifs, ...systemNotifs]);
        } catch {
          setNotifs([{
            id: "sys-welcome",
            category: "sistem",
            icon: "shield-checkmark",
            iconColor: NEO_ACCENT,
            title: "Selamat datang di GarudaChain",
            body: "Dompet Anda berhasil dibuat. Simpan frasa pemulihan di tempat yang aman.",
            time: "—",
            read: true,
          }]);
        }
      }
      setLoading(false);
    })();
  }, []);

  const filtered = notifs.filter((n) => {
    if (activeCategory === "Semua") return true;
    if (activeCategory === "Transaksi") return n.category === "transaksi";
    if (activeCategory === "Sistem") return n.category === "sistem";
    return true;
  });

  const unreadCount = notifs.filter((n) => !n.read).length;
  const markAllRead = () => setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) => setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));

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
          <Text style={styles.headerTitle}>Notifikasi</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.markAllBtn}
          onPress={markAllRead}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.markAllText}>Semua dibaca</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
            onPress={() => setActiveCategory(cat)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Memuat notifikasi...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name={"notifications-off-outline" as IoniconName} size={48} color={NEO_MUTED} />
            <Text style={styles.emptyText}>Tidak ada notifikasi</Text>
          </View>
        ) : (
          <View style={[styles.notifCard, neoRaisedMd]}>
            {filtered.map((notif, i) => (
              <TouchableOpacity
                key={notif.id}
                style={[
                  styles.notifRow,
                  i < filtered.length - 1 && styles.notifRowBorder,
                  !notif.read && styles.notifRowUnread,
                ]}
                activeOpacity={0.7}
                onPress={() => markRead(notif.id)}
              >
                <View style={[styles.notifIconWrap, { backgroundColor: notif.iconColor + "20" }]}>
                  <Ionicons name={notif.icon} size={22} color={notif.iconColor} />
                </View>
                <View style={styles.notifBody}>
                  <View style={styles.notifTopRow}>
                    <Text style={[styles.notifTitle, !notif.read && styles.notifTitleUnread]}>
                      {notif.title}
                    </Text>
                    <Text style={styles.notifTime}>{notif.time}</Text>
                  </View>
                  <Text style={styles.notifDesc} numberOfLines={2}>{notif.body}</Text>
                </View>
                {!notif.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 12, gap: 8 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  badge: {
    backgroundColor: NEO_ACCENT, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  markAllBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  markAllText: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_ACCENT },
  categoryScroll: { maxHeight: 52, paddingVertical: 10 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: NEO_BG, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)",
  },
  categoryChipActive: { backgroundColor: NEO_ACCENT, borderColor: NEO_ACCENT },
  categoryChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  categoryChipTextActive: { color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  notifCard: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden" },
  notifRow: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  notifRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  notifRowUnread: { backgroundColor: NEO_ACCENT + "08" },
  notifIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifBody: { flex: 1 },
  notifTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  notifTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: NEO_TEXT, flex: 1, marginRight: 8 },
  notifTitleUnread: { fontFamily: "Inter_700Bold" },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, flexShrink: 0 },
  notifDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NEO_ACCENT, marginTop: 6, flexShrink: 0 },
});
