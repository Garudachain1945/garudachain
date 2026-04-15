import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoInset, neoAccentBtn,
} from "@/constants/neo";
import { getAddressInfo, formatGRD } from "@/utils/garuda-api";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const STORAGE_KEY = "garuda_watch_addresses";

interface WatchAddress {
  id: string;
  name: string;
  address: string;
  balance: number;
  txCount: number;
}

export default function PantauAlamatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [watchList, setWatchList] = useState<WatchAddress[]>([]);

  useEffect(() => {
    void (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setWatchList(JSON.parse(saved));
    })();
  }, []);

  const persist = async (list: WatchAddress[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const canImport = address.trim().length > 10;

  const handleImport = async () => {
    if (!canImport) return;
    setLoading(true);
    try {
      const info = await getAddressInfo(address.trim());
      const entry: WatchAddress = {
        id: `w${Date.now()}`,
        name: name.trim() || `Pantau ${address.trim().slice(0, 8)}...`,
        address: address.trim(),
        balance: info.balance ?? 0,
        txCount: info.txCount ?? 0,
      };
      const updated = [entry, ...watchList];
      setWatchList(updated);
      await persist(updated);
      setName("");
      setAddress("");
      Alert.alert("Berhasil", `Alamat ${entry.name} berhasil ditambahkan ke daftar pantau.`);
    } catch {
      Alert.alert("Gagal", "Alamat tidak ditemukan di jaringan GarudaChain. Pastikan alamat benar.");
    }
    setLoading(false);
  };

  const handleDelete = (id: string) => {
    const updated = watchList.filter((w) => w.id !== id);
    setWatchList(updated);
    void persist(updated);
  };

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
        <Text style={styles.headerTitle}>Pantau Alamat</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconSection}>
          <View style={[styles.iconCircle, neoRaisedMd]}>
            <Ionicons name={"eye-outline" as IoniconName} size={40} color={NEO_ACCENT} />
          </View>
          <Text style={styles.descTitle}>Pantau Dompet GarudaChain</Text>
          <Text style={styles.descText}>
            Tambahkan alamat GarudaChain yang ingin Anda pantau. Lihat saldo dan riwayat transaksi tanpa akses penuh.
          </Text>
        </View>

        <View style={[styles.networkBadge, neoRaisedMd]}>
          <View style={[styles.networkDot, { backgroundColor: "#C8922A22" }]}>
            <Text style={styles.networkDotText}>G</Text>
          </View>
          <Text style={styles.networkName}>GarudaChain · Mainnet</Text>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Aktif</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>NAMA (OPSIONAL)</Text>
        <View style={[styles.inputWrap, neoInset]}>
          <TextInput
            style={styles.input}
            placeholder="Nama untuk alamat ini"
            placeholderTextColor={NEO_MUTED}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ALAMAT GARUDACHAIN</Text>
        <View style={[styles.inputWrap, neoInset]}>
          <TextInput
            style={[styles.input, { minHeight: 48 }]}
            placeholder="grd1q..."
            placeholderTextColor={NEO_MUTED}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {address.length > 0 && (
            <TouchableOpacity
              onPress={() => setAddress("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={NEO_MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* Watch list */}
        {watchList.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>DAFTAR PANTAU ({watchList.length})</Text>
            <View style={[styles.watchCard, neoRaisedMd]}>
              {watchList.map((w, i) => (
                <View key={w.id} style={[styles.watchRow, i > 0 && styles.watchRowBorder]}>
                  <View style={[styles.watchIcon, { backgroundColor: NEO_ACCENT + "20" }]}>
                    <Text style={styles.watchIconText}>G</Text>
                  </View>
                  <View style={styles.watchInfo}>
                    <Text style={styles.watchName}>{w.name}</Text>
                    <Text style={styles.watchAddr}>{w.address.slice(0, 10)}...{w.address.slice(-8)}</Text>
                    <Text style={styles.watchBalance}>{formatGRD(w.balance)} GRD · {w.txCount} TX</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={"trash-outline" as IoniconName} size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.infoCard}>
          <Ionicons name={"information-circle-outline" as IoniconName} size={16} color={NEO_ACCENT} />
          <Text style={styles.infoText}>
            Akun pantau hanya memiliki akses lihat saja. Anda tidak dapat mengirim aset dari akun ini.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomPad + 12 }]}>
        <TouchableOpacity
          style={[styles.importBtn, neoAccentBtn, (!canImport || loading) && styles.importBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleImport}
          disabled={!canImport || loading}
        >
          <Text style={styles.importBtnText}>{loading ? "Memverifikasi..." : "Tambah ke Pantauan"}</Text>
        </TouchableOpacity>
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  iconSection: { alignItems: "center", marginBottom: 24 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  descTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 8, textAlign: "center" },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 21, textAlign: "center" },
  networkBadge: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: NEO_BG, borderRadius: 16, padding: 14,
  },
  networkDot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  networkDotText: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  networkName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  activeBadge: { backgroundColor: "#22C55E20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    letterSpacing: 0.8, marginBottom: 10, textTransform: "uppercase",
  },
  inputWrap: {
    backgroundColor: NEO_BG, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 4,
    flexDirection: "row", alignItems: "center",
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_TEXT, paddingVertical: 14 },
  watchCard: { backgroundColor: NEO_BG, borderRadius: 18, overflow: "hidden" },
  watchRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  watchRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  watchIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  watchIconText: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  watchInfo: { flex: 1 },
  watchName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  watchAddr: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 2 },
  watchBalance: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_ACCENT },
  infoCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: NEO_ACCENT + "12", borderRadius: 14, padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: NEO_ACCENT + "30",
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 19 },
  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12, backgroundColor: NEO_BG,
    borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)",
  },
  importBtn: { paddingVertical: 16, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  importBtnDisabled: { opacity: 0.45 },
  importBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" },
});
