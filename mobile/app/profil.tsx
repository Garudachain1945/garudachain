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
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoRaisedSm, neoInset, neoAccentBtn,
} from "@/constants/neo";
import { getActiveAccount, clearWallet } from "@/utils/wallet-storage";
import { getAddressInfo, formatGRD, type TxItem } from "@/utils/garuda-api";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const BADGES = [
  { icon: "shield-checkmark" as IoniconName, label: "Terverifikasi", color: "#22C55E" },
  { icon: "star" as IoniconName, label: "GarudaChain", color: "#C8922A" },
];

export default function ProfilScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState("GarudaChain");
  const [copied, setCopied] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [balance, setBalance] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [txHistory, setTxHistory] = useState<TxItem[]>([]);

  useEffect(() => {
    void (async () => {
      const account = await getActiveAccount();
      if (account) {
        setWalletAddress(account.address);
        const savedName = await AsyncStorage.getItem("garuda_username");
        setUsername(savedName || account.name);
        try {
          const info = await getAddressInfo(account.address);
          setBalance(info.balance ?? 0);
          setTxCount(info.txCount ?? 0);
          setTxHistory(info.transactions ?? []);
        } catch {}
      }
    })();
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditToggle = async () => {
    if (editMode && username.trim()) {
      await AsyncStorage.setItem("garuda_username", username.trim());
    }
    setEditMode((v) => !v);
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      const ok = window.confirm(
        "Keluar dari Akun?\n\nPastikan Anda sudah menyimpan frasa pemulihan. Seluruh data dompet akan dihapus dari perangkat ini."
      );
      if (ok) void clearWallet().then(() => router.replace("/"));
      return;
    }
    Alert.alert(
      "Keluar dari Akun",
      "Pastikan Anda sudah menyimpan frasa pemulihan. Seluruh data dompet akan dihapus dari perangkat ini.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Keluar",
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
        <Text style={styles.headerTitle}>Profil Saya</Text>
        <TouchableOpacity
          style={[styles.editBtn, neoRaisedSm]}
          onPress={handleEditToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={(editMode ? "checkmark" : "create-outline") as IoniconName} size={18} color={editMode ? NEO_ACCENT : NEO_MUTED} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.avatarCard, neoRaisedMd]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>GC</Text>
          </View>

          {editMode ? (
            <View style={[styles.nameInput, neoInset]}>
              <TextInput
                style={styles.nameInputText}
                value={username}
                onChangeText={setUsername}
                placeholder="Nama pengguna"
                placeholderTextColor={NEO_MUTED}
                autoFocus
              />
            </View>
          ) : (
            <Text style={styles.profileName}>@{username}</Text>
          )}

          <TouchableOpacity style={styles.addressRow} onPress={handleCopy} activeOpacity={0.7}>
            <Text style={styles.addressText} numberOfLines={1}>
              {walletAddress ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}` : "Belum ada dompet"}
            </Text>
            <Ionicons
              name={(copied ? "checkmark-circle" : "copy-outline") as IoniconName}
              size={16}
              color={copied ? "#22C55E" : NEO_MUTED}
            />
            {copied && <Text style={styles.copiedText}>Tersalin!</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: "Total Transaksi", value: String(txCount || 0) },
            { label: "Saldo GRD", value: formatGRD(balance) },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, neoRaisedMd]}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Lencana</Text>
        <View style={styles.badgesRow}>
          {BADGES.map((b) => (
            <View key={b.label} style={[styles.badgeCard, neoRaisedMd]}>
              <View style={[styles.badgeIcon, { backgroundColor: b.color + "20" }]}>
                <Ionicons name={b.icon} size={22} color={b.color} />
              </View>
              <Text style={styles.badgeLabel}>{b.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
        <View style={[styles.txCard, neoRaisedMd]}>
          {txHistory.length === 0 ? (
            <Text style={[styles.txDate, { padding: 16, textAlign: "center" }]}>Belum ada transaksi</Text>
          ) : txHistory.slice(0, 8).map((tx, i) => {
            const isSend = tx.method === "send" || (tx.from === walletAddress);
            const color = isSend ? "#EF4444" : "#22C55E";
            const icon: IoniconName = isSend ? "arrow-forward" : "arrow-down";
            const sign = isSend ? "-" : "+";
            return (
              <View
                key={tx.txid}
                style={[styles.txRow, i < txHistory.slice(0, 8).length - 1 && styles.txRowBorder]}
              >
                <View style={[styles.txIcon, { backgroundColor: color + "20" }]}>
                  <Ionicons name={icon} size={18} color={color} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txType}>{isSend ? "Kirim GRD" : "Terima GRD"}</Text>
                  <Text style={styles.txDate}>{tx.timestamp ? new Date(tx.timestamp).toLocaleDateString("id-ID") : "—"}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color }]}>{sign}{formatGRD(tx.value)}</Text>
                  <Text style={styles.txIDR}>Fee: {formatGRD(tx.fee)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={[styles.dangerBtn, neoRaisedMd]} activeOpacity={0.8} onPress={handleLogout}>
          <Ionicons name={"log-out-outline" as IoniconName} size={18} color="#EF4444" />
          <Text style={styles.dangerBtnText}>Keluar dari Akun</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, flex: 1, textAlign: "center" },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  avatarCard: {
    backgroundColor: NEO_BG,
    borderRadius: 24,
    alignItems: "center",
    padding: 24,
    marginBottom: 16,
    gap: 12,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: NEO_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  nameInput: {
    width: "100%",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  nameInputText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: NEO_TEXT,
    textAlign: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addressText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, flex: 1 },
  copiedText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 4,
  },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: NEO_TEXT,
    marginBottom: 12,
  },
  badgesRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  badgeCard: {
    flex: 1,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 8,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: NEO_TEXT, textAlign: "center" },
  txCard: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden", marginBottom: 24 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  txInfo: { flex: 1 },
  txType: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  txIDR: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EF444430",
  },
  dangerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
});
