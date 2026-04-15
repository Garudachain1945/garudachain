import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Switch,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd,
} from "@/constants/neo";
import { getMnemonic, clearWallet } from "@/utils/wallet-storage";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const SESSIONS = [
  { label: "1 menit", value: "1m" },
  { label: "5 menit", value: "5m" },
  { label: "15 menit", value: "15m" },
  { label: "1 jam", value: "1h" },
];

export default function KeamananScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [biometric, setBiometric] = useState(false);
  const [autoLock, setAutoLock] = useState(true);
  const [hideBalance, setHideBalance] = useState(false);
  const [antiPhishing, setAntiPhishing] = useState(true);
  const [txConfirm, setTxConfirm] = useState(true);
  const [selectedSession, setSelectedSession] = useState("5m");

  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  // Load persisted settings
  useEffect(() => {
    void (async () => {
      const saved = await AsyncStorage.getItem("garuda_security_settings");
      if (saved) {
        const s = JSON.parse(saved);
        setBiometric(s.biometric ?? false);
        setAutoLock(s.autoLock ?? true);
        setHideBalance(s.hideBalance ?? false);
        setAntiPhishing(s.antiPhishing ?? true);
        setTxConfirm(s.txConfirm ?? true);
        setSelectedSession(s.selectedSession ?? "5m");
      }
    })();
  }, []);

  const saveSettings = async (patch: object) => {
    const current = await AsyncStorage.getItem("garuda_security_settings");
    const prev = current ? JSON.parse(current) : {};
    await AsyncStorage.setItem("garuda_security_settings", JSON.stringify({ ...prev, ...patch }));
  };

  const toggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    void saveSettings({ [key]: value });
  };

  const handleViewMnemonic = () => {
    Alert.alert(
      "Lihat Frasa Pemulihan",
      "Pastikan tidak ada orang yang melihat layar Anda. Jangan pernah bagikan frasa ini kepada siapapun.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Tampilkan",
          style: "destructive",
          onPress: async () => {
            const m = await getMnemonic();
            if (m) {
              setMnemonic(m);
              setShowMnemonic(true);
            }
          },
        },
      ]
    );
  };

  const handleCopyMnemonic = async () => {
    await Clipboard.setStringAsync(mnemonic);
    setMnemonicCopied(true);
    setTimeout(() => setMnemonicCopied(false), 2000);
  };

  const handleLogout = () => {
    Alert.alert(
      "Keluar & Reset Dompet",
      "Seluruh data dompet akan dihapus dari perangkat. Pastikan Anda sudah menyimpan frasa pemulihan.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await clearWallet();
            router.replace("/");
          },
        },
      ]
    );
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
        <Text style={styles.headerTitle}>Keamanan & Privasi</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Autentikasi</Text>
        <View style={[styles.card, neoRaisedMd]}>
          <View style={[styles.itemRow, styles.itemRowBorder]}>
            <View style={[styles.itemIcon, { backgroundColor: "#627EEA20" }]}>
              <Ionicons name={"finger-print" as IoniconName} size={20} color="#627EEA" />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Biometrik</Text>
              <Text style={styles.itemDesc}>Sidik jari / Face ID</Text>
            </View>
            <Switch
              value={biometric}
              onValueChange={(v) => toggle("biometric", v, setBiometric)}
              trackColor={{ true: NEO_ACCENT, false: "#D1D5DD" }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.itemRow, styles.itemRowBorder]}>
            <View style={[styles.itemIcon, { backgroundColor: "#22C55E20" }]}>
              <Ionicons name={"timer-outline" as IoniconName} size={20} color="#22C55E" />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Kunci Otomatis</Text>
              <Text style={styles.itemDesc}>Kunci saat tidak aktif</Text>
            </View>
            <Switch
              value={autoLock}
              onValueChange={(v) => toggle("autoLock", v, setAutoLock)}
              trackColor={{ true: NEO_ACCENT, false: "#D1D5DD" }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {autoLock && (
          <>
            <Text style={styles.sectionLabel}>Waktu Kunci Otomatis</Text>
            <View style={[styles.card, neoRaisedMd]}>
              <View style={styles.sessionGrid}>
                {SESSIONS.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.sessionChip, selectedSession === s.value && styles.sessionChipActive]}
                    onPress={() => { setSelectedSession(s.value); void saveSettings({ selectedSession: s.value }); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sessionChipText, selectedSession === s.value && styles.sessionChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>Privasi</Text>
        <View style={[styles.card, neoRaisedMd]}>
          <View style={styles.itemRow}>
            <View style={[styles.itemIcon, { backgroundColor: "#8492A620" }]}>
              <Ionicons name={"eye-off-outline" as IoniconName} size={20} color={NEO_MUTED} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Sembunyikan Saldo</Text>
              <Text style={styles.itemDesc}>Tampilkan *** di halaman utama</Text>
            </View>
            <Switch
              value={hideBalance}
              onValueChange={(v) => toggle("hideBalance", v, setHideBalance)}
              trackColor={{ true: NEO_ACCENT, false: "#D1D5DD" }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.itemRow, styles.itemRowBorder]}>
            <View style={[styles.itemIcon, { backgroundColor: "#EF444420" }]}>
              <Ionicons name={"shield-outline" as IoniconName} size={20} color="#EF4444" />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Anti-Phishing</Text>
              <Text style={styles.itemDesc}>Tandai situs berbahaya</Text>
            </View>
            <Switch
              value={antiPhishing}
              onValueChange={(v) => toggle("antiPhishing", v, setAntiPhishing)}
              trackColor={{ true: NEO_ACCENT, false: "#D1D5DD" }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.itemRow, styles.itemRowBorder]}>
            <View style={[styles.itemIcon, { backgroundColor: "#C8922A20" }]}>
              <Ionicons name={"checkmark-circle-outline" as IoniconName} size={20} color={NEO_ACCENT} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Konfirmasi Transaksi</Text>
              <Text style={styles.itemDesc}>Selalu minta konfirmasi sebelum kirim</Text>
            </View>
            <Switch
              value={txConfirm}
              onValueChange={(v) => toggle("txConfirm", v, setTxConfirm)}
              trackColor={{ true: NEO_ACCENT, false: "#D1D5DD" }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Pemulihan</Text>
        <View style={[styles.card, neoRaisedMd]}>
          <TouchableOpacity style={styles.itemRow} activeOpacity={0.7} onPress={handleViewMnemonic}>
            <View style={[styles.itemIcon, { backgroundColor: NEO_ACCENT + "20" }]}>
              <Ionicons name={"document-text-outline" as IoniconName} size={20} color={NEO_ACCENT} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Lihat Frasa Pemulihan</Text>
              <Text style={styles.itemDesc}>Simpan di tempat aman, jangan bagikan</Text>
            </View>
            <Ionicons name={"chevron-forward" as IoniconName} size={18} color={NEO_MUTED} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.itemRow, styles.itemRowBorder]} activeOpacity={0.7} onPress={handleViewMnemonic}>
            <View style={[styles.itemIcon, { backgroundColor: "#627EEA20" }]}>
              <Ionicons name={"cloud-upload-outline" as IoniconName} size={20} color="#627EEA" />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemLabel}>Cadangan Terenkripsi</Text>
              <Text style={styles.itemDesc}>Salin frasa pemulihan sebagai cadangan</Text>
            </View>
            <Ionicons name={"chevron-forward" as IoniconName} size={18} color={NEO_MUTED} />
          </TouchableOpacity>
        </View>

        <View style={[styles.warningCard, neoRaisedMd]}>
          <Ionicons name={"warning-outline" as IoniconName} size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            Jangan pernah bagikan frasa pemulihan atau kunci privat Anda kepada siapapun.
            GarudaChain tidak akan pernah memintanya.
          </Text>
        </View>

        <TouchableOpacity style={[styles.dangerBtn, neoRaisedMd]} activeOpacity={0.8} onPress={handleLogout}>
          <Ionicons name={"trash-outline" as IoniconName} size={18} color="#EF4444" />
          <Text style={styles.dangerBtnText}>Reset & Hapus Dompet</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Mnemonic Modal */}
      <Modal visible={showMnemonic} transparent animationType="fade" onRequestClose={() => setShowMnemonic(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.mnemonicSheet, neoRaisedMd, { paddingBottom: bottomPad + 16 }]}>
            <View style={styles.mnemonicHeader}>
              <Text style={styles.mnemonicTitle}>Frasa Pemulihan</Text>
              <TouchableOpacity onPress={() => setShowMnemonic(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={"close" as IoniconName} size={22} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>
            <View style={styles.warningBanner}>
              <Ionicons name={"warning" as IoniconName} size={16} color="#F59E0B" />
              <Text style={styles.warningBannerText}>Jangan bagikan frasa ini ke siapapun!</Text>
            </View>
            <View style={styles.wordGrid}>
              {mnemonic.split(" ").map((word, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordNum}>{i + 1}</Text>
                  <Text style={styles.wordText}>{word}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.copyMnemonicBtn, { backgroundColor: mnemonicCopied ? "#22C55E" : NEO_ACCENT }]}
              onPress={handleCopyMnemonic}
              activeOpacity={0.85}
            >
              <Ionicons name={(mnemonicCopied ? "checkmark-circle" : "copy-outline") as IoniconName} size={18} color="#fff" />
              <Text style={styles.copyMnemonicText}>{mnemonicCopied ? "Tersalin!" : "Salin Frasa"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, marginTop: 16,
  },
  card: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden" },
  itemRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemInfo: { flex: 1 },
  itemLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  itemDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  sessionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 14 },
  sessionChip: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: "transparent",
  },
  sessionChipActive: { backgroundColor: NEO_ACCENT + "20", borderColor: NEO_ACCENT },
  sessionChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  sessionChipTextActive: { color: NEO_ACCENT, fontFamily: "Inter_600SemiBold" },
  warningCard: {
    backgroundColor: "#F59E0B10", borderRadius: 16, padding: 14,
    flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 16,
    borderWidth: 1, borderColor: "#F59E0B30",
  },
  warningText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 20 },
  dangerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: NEO_BG, borderRadius: 16, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: "#EF444430",
  },
  dangerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  mnemonicSheet: {
    backgroundColor: NEO_BG, borderRadius: 24, padding: 20, width: "100%",
  },
  mnemonicHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14,
  },
  mnemonicTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  warningBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF9EE", borderRadius: 10, padding: 10, marginBottom: 16,
  },
  warningBannerText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#92400E" },
  wordGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  wordChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, width: "30%",
  },
  wordNum: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, minWidth: 14 },
  wordText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  copyMnemonicBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  copyMnemonicText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
