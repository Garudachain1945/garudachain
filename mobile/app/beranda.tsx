import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  Animated,
  Alert,
  TouchableWithoutFeedback,
  Dimensions,
  TextInput,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoInset, neoAccentBtn,
} from "@/constants/neo";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadWallet, setActiveAccount, getActiveAccount, getQuantumAddress, getMnemonic, verifyPassword, updateAccountName, removeAccount, clearWallet } from "@/utils/wallet-storage";
import { getAddressInfo, formatGRD, shortAddr, satoshiToGRD, type TxItem, getStablecoinList, getPeggedStablecoinList, getStablecoinPegRate, getStockList, dexSwap, dexPlaceOrder, crossSwap, getMyDexOrders, cancelDexOrder, getAssetPrice, getDexWalletInfo, getUTXOs, broadcastTx, getOracleRates, getTradeHistory, getPresales, buyPresale, getDividendHistory, type StablecoinEntry, type StockEntry, type DexOrder, type OracleRate, type TradeItem, type PresaleInfo, type DividendInfo } from "@/utils/garuda-api";
import { getAllOrders, getMyListings, saveMyListings, processAutoReleases, type P2POrder, type P2PMyListing } from "@/utils/p2p-storage";
import { formatAddress, deriveKey, buildAndSignTx, deriveQuantumKey, buildAndSignQuantumTx } from "@/utils/wallet-crypto";
import { AssetLogo } from "@/components/AssetLogo";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const SCREEN_WIDTH = Platform.OS === "web" ? 390 : Dimensions.get("window").width;
const PANEL_WIDTH = 220;

interface WalletItem {
  id: string;
  label: string;
  initial: string;
  color: string;
  balance?: string | null;
  address?: string;
  accountIndex?: number;
}

const SETTINGS_SECTIONS = [
  {
    items: [
      { key: "accounts", icon: "people-outline", label: "Kelola Akun", badge: null },
      { key: "prefs", icon: "options-outline", label: "Preferensi", badge: null },
      { key: "security", icon: "shield-outline", label: "Keamanan & Privasi", badge: null },
    ],
  },
  {
    items: [
      { key: "networks", icon: "globe-outline", label: "Jaringan Aktif", badge: "Semua" },
      { key: "connected", icon: "link-outline", label: "Aplikasi Terhubung", badge: null },
      { key: "addressbook", icon: "book-outline", label: "Buku Alamat", badge: null },
    ],
  },
  {
    items: [
      { key: "notifications", icon: "notifications-outline", label: "Notifikasi", badge: null },
      { key: "language", icon: "language-outline", label: "Bahasa", badge: "Indonesia" },
      { key: "theme", icon: "moon-outline", label: "Tema Tampilan", badge: null },
    ],
  },
  {
    items: [
      { key: "help", icon: "help-circle-outline", label: "Bantuan & FAQ", badge: null },
    ],
  },
];

const ACTIVE_NETWORKS = [
  { id: "grd", label: "GarudaChain", initial: "G", color: "#C8922A", enabled: true },
];

function ActiveNetworksSheet({
  visible,
  onClose,
  topPad,
  bottomPad,
}: {
  visible: boolean;
  onClose: () => void;
  topPad: number;
  bottomPad: number;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [networks, setNetworks] = useState(ACTIVE_NETWORKS);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: false }).start();
    }
  }, [visible]);

  const toggle = (id: string) =>
    setNetworks((prev) => prev.map((n) => n.id === id ? { ...n, enabled: !n.enabled } : n));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: NEO_BG, transform: [{ translateX: slideAnim }] },
          { paddingTop: topPad, paddingBottom: bottomPad + 16 },
        ]}
      >
        {/* Header */}
        <View style={netStyles.header}>
          <TouchableOpacity onPress={onClose} style={netStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
          </TouchableOpacity>
          <Text style={netStyles.headerTitle}>Jaringan Aktif</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          {networks.map((net, idx) => (
            <View
              key={net.id}
              style={[
                netStyles.row,
                !net.enabled && { opacity: 0.55 },
              ]}
            >
              {/* Icon circle */}
              <View style={[netStyles.avatar, { backgroundColor: net.color + "22", borderColor: net.color + "55", borderWidth: 1.5 }]}>
                <Text style={[netStyles.avatarText, { color: net.color }]}>{net.initial}</Text>
              </View>

              {/* Name */}
              <Text style={netStyles.label}>{net.label}</Text>

              {/* Toggle */}
              <Switch
                value={net.enabled}
                onValueChange={() => toggle(net.id)}
                trackColor={{ false: "#D1D5DD", true: NEO_ACCENT + "99" }}
                thumbColor={net.enabled ? NEO_ACCENT : "#F0F0F3"}
                ios_backgroundColor="#D1D5DD"
              />
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const netStyles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)",
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "3px 3px 7px #D1D5DD, -3px -3px 7px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },
    }),
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: NEO_BG, borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 10,
    ...Platform.select<object>({
      web: { boxShadow: "3px 3px 8px #D1D5DD, -3px -3px 8px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
    }),
  },
  avatar: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  label: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT },
});

const CONNECTED_APPS = [
  {
    section: "Konfirmasi Otomatis",
    items: [
      { id: "phantom", domain: "trade.phantom.com", sub: "Hingga 22 Apr 2026 1:20 p.m.", icon: "👻", color: "#AB9FF2" },
    ],
  },
  {
    section: "Minggu Lalu",
    items: [
      { id: "local3000", domain: "localhost:3000", sub: null, icon: "⬆", color: "#3A3A3A" },
    ],
  },
  {
    section: "Lebih Lama",
    items: [
      { id: "local5173", domain: "localhost:5173", sub: null, icon: "⬆", color: "#3A3A3A" },
      { id: "local5175", domain: "localhost:5175", sub: null, icon: "⬆", color: "#3A3A3A" },
      { id: "blackcat",  domain: "blackcatsol.com", sub: null, icon: "🐾", color: "#222222" },
      { id: "poly",      domain: "polymarket.com",  sub: null, icon: "📊", color: "#0066FF" },
    ],
  },
];

function ConnectedAppsSheet({
  visible,
  onClose,
  topPad,
  bottomPad,
}: {
  visible: boolean;
  onClose: () => void;
  topPad: number;
  bottomPad: number;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: false }).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: NEO_BG, transform: [{ translateX: slideAnim }] },
          { paddingTop: topPad, paddingBottom: bottomPad + 16 },
        ]}
      >
        {/* Header */}
        <View style={caStyles.header}>
          <TouchableOpacity onPress={onClose} style={caStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
          </TouchableOpacity>
          <Text style={caStyles.headerTitle}>Aplikasi Terhubung</Text>
          <TouchableOpacity style={caStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={"ellipsis-horizontal" as IoniconName} size={20} color={NEO_TEXT} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          {CONNECTED_APPS.map((group) => (
            <View key={group.section} style={{ marginBottom: 8 }}>
              {/* Section label */}
              <Text style={caStyles.sectionLabel}>{group.section}</Text>

              {/* App rows */}
              <View style={caStyles.groupCard}>
                {group.items.map((app, idx) => (
                  <React.Fragment key={app.id}>
                    <TouchableOpacity style={caStyles.appRow} activeOpacity={0.7}>
                      {/* Icon */}
                      <View style={[caStyles.appIcon, { backgroundColor: app.color + "22", borderColor: app.color + "55", borderWidth: 1.5 }]}>
                        <Text style={{ fontSize: 18 }}>{app.icon}</Text>
                      </View>

                      {/* Info */}
                      <View style={{ flex: 1 }}>
                        <Text style={caStyles.appDomain}>{app.domain}</Text>
                        {app.sub && <Text style={caStyles.appSub}>{app.sub}</Text>}
                      </View>

                      <Ionicons name={"chevron-forward" as IoniconName} size={16} color={NEO_MUTED} />
                    </TouchableOpacity>
                    {idx < group.items.length - 1 && <View style={caStyles.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const caStyles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)",
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "3px 3px 7px #D1D5DD, -3px -3px 7px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },
    }),
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  sectionLabel: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    marginBottom: 8, marginTop: 12, marginLeft: 4, textTransform: "uppercase", letterSpacing: 0.8,
  },
  groupCard: {
    backgroundColor: NEO_BG, borderRadius: 16, overflow: "hidden",
    ...Platform.select<object>({
      web: { boxShadow: "4px 4px 10px #D1D5DD, -4px -4px 10px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 4 },
    }),
  },
  appRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16,
  },
  appIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0,
  },
  appDomain: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  appSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 2 },
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginHorizontal: 16 },
});

function SettingsSheet({
  visible,
  onClose,
  topPad,
  onManageAccounts,
  onNetworks,
  onConnectedApps,
  accountCount,
}: {
  visible: boolean;
  onClose: () => void;
  topPad: number;
  onManageAccounts: () => void;
  onNetworks: () => void;
  onConnectedApps: () => void;
  accountCount: number;
}) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-900)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [search, setSearch] = useState("");

  const SETTINGS_NAV: Record<string, string> = {
    security: "/keamanan",
    addressbook: "/buku-alamat",
    notifications: "/notifikasi",
    help: "/bantuan",
  };

  const handleSettingPress = (key: string) => {
    if (key === "accounts") { onClose(); onManageAccounts(); return; }
    if (key === "networks") { onClose(); onNetworks(); return; }
    if (key === "connected") { onClose(); onConnectedApps(); return; }
    if (SETTINGS_NAV[key]) { onClose(); router.push(SETTINGS_NAV[key] as any); return; }
    if (key === "prefs" || key === "language" || key === "theme") {
      Alert.alert("Segera Hadir", "Fitur ini sedang dalam pengembangan.");
      return;
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -900, duration: 220, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  const allItems = SETTINGS_SECTIONS.flatMap((s) => s.items);
  const filtered = search.trim()
    ? allItems.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[settingStyles.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View style={[settingStyles.sheet, { paddingTop: topPad, transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={settingStyles.header}>
            <TouchableOpacity onPress={onClose} style={settingStyles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#8492A6" />
            </TouchableOpacity>
            <Text style={settingStyles.headerTitle}>Pengaturan</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Search bar */}
          <View style={settingStyles.searchBar}>
            <Ionicons name="search-outline" size={16} color="#8492A6" />
            <Text
              style={settingStyles.searchInput}
              onPress={() => {}}
            >
              {search || "Cari..."}
            </Text>
          </View>

          <ScrollView style={settingStyles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Profile row */}
            <TouchableOpacity style={settingStyles.profileRow} activeOpacity={0.7} onPress={() => { onClose(); router.push("/profil" as any); }}>
              <View style={settingStyles.profileAvatar}>
                <Text style={settingStyles.profileAvatarText}>GC</Text>
              </View>
              <Text style={settingStyles.profileName}>@GarudaChain</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DD" />
            </TouchableOpacity>

            {/* Settings sections */}
            {(filtered ? [{ items: filtered }] : SETTINGS_SECTIONS).map((section, si) => (
              <View key={si} style={settingStyles.section}>
                {section.items.map((item, ii) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      settingStyles.settingRow,
                      ii < section.items.length - 1 && settingStyles.settingRowBorder,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handleSettingPress(item.key)}
                  >
                    <View style={settingStyles.settingIconWrap}>
                      <Ionicons name={item.icon as IoniconName} size={18} color="#C8922A" />
                    </View>
                    <Text style={settingStyles.settingLabel}>{item.label}</Text>
                    {(item.key === "accounts" ? accountCount > 0 : !!item.badge) && (
                      <Text style={settingStyles.settingBadge}>
                        {item.key === "accounts" ? String(accountCount) : item.badge}
                      </Text>
                    )}
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DD" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>

          {/* Lock Wallet */}
          <TouchableOpacity
            style={settingStyles.lockBtn}
            onPress={() => { onClose(); router.replace("/unlock"); }}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed-outline" size={18} color="#ffffff" />
            <Text style={settingStyles.lockBtnText}>Kunci Dompet</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function EditAccountSheet({
  visible,
  account,
  onClose,
  topPad,
  bottomPad,
}: {
  visible: boolean;
  account: WalletItem | null;
  onClose: () => void;
  topPad: number;
  bottomPad: number;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const nameSlideAnim = useRef(new Animated.Value(400)).current;
  const pkSlideAnim = useRef(new Animated.Value(400)).current;
  const [showEditName, setShowEditName] = useState(false);
  const [editName, setEditName] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [pkPassword, setPkPassword] = useState("");
  const [pkShowPass, setPkShowPass] = useState(false);
  const [pkStep, setPkStep] = useState(0); // 0=password, 1=warning, 2=revealed
  const [pkChecked, setPkChecked] = useState(false);
  const [pkError, setPkError] = useState("");
  const [revealedKey, setRevealedKey] = useState("");          // secp256k1
  const [revealedQuantumKey, setRevealedQuantumKey] = useState(""); // ML-DSA-87
  const [pkCopied, setPkCopied] = useState(false);
  const [qkCopied, setQkCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: false }).start();
      setShowEditName(false);
      setShowPrivateKey(false);
      setPkPassword("");
      setPkStep(0);
      setPkChecked(false);
      setPkError("");
      setRevealedKey("");
      setRevealedQuantumKey("");
      setPkCopied(false);
      setQkCopied(false);
      setAddrCopied(false);
    }
  }, [visible]);

  const openEditName = () => {
    setEditName(account?.label ?? "");
    setShowEditName(true);
    Animated.spring(nameSlideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
  };

  const closeEditName = () => {
    Animated.timing(nameSlideAnim, { toValue: 400, duration: 200, useNativeDriver: false }).start(() => setShowEditName(false));
  };

  const openPrivateKey = () => {
    setPkPassword("");
    setPkStep(0);
    setPkChecked(false);
    setPkShowPass(false);
    setShowPrivateKey(true);
    Animated.spring(pkSlideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
  };

  const closePrivateKey = () => {
    Animated.timing(pkSlideAnim, { toValue: 400, duration: 200, useNativeDriver: false }).start(() => {
      setShowPrivateKey(false);
      setPkPassword("");
      setPkStep(0);
      setPkChecked(false);
      setPkError("");
      setRevealedKey("");
      setRevealedQuantumKey("");
      setPkCopied(false);
      setQkCopied(false);
    });
  };

  if (!account || !visible) return null;

  return (
    <>
      {/* Edit Account main screen */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: NEO_BG, transform: [{ translateX: slideAnim }] },
          { paddingTop: topPad, paddingBottom: bottomPad + 16 },
        ]}
      >
        {/* Header */}
        <View style={editStyles.header}>
          <TouchableOpacity onPress={onClose} style={editStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
          </TouchableOpacity>
          <Text style={editStyles.headerTitle}>Edit Akun</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Avatar */}
        <View style={editStyles.avatarSection}>
          <View style={[editStyles.avatarCircle, { backgroundColor: account.color + "22", borderColor: account.color, borderWidth: 2 }]}>
            <Text style={[editStyles.avatarText, { color: account.color }]}>{account.initial}</Text>
          </View>
          <View style={editStyles.avatarEditBtn}>
            <Ionicons name={"pencil" as IoniconName} size={12} color="#fff" />
          </View>
        </View>

        {/* Info rows */}
        <View style={editStyles.section}>
          <TouchableOpacity style={editStyles.row} activeOpacity={0.7} onPress={openEditName}>
            <Text style={editStyles.rowLabel}>Nama Akun</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={editStyles.rowValue}>{account.label}</Text>
              <Ionicons name={"chevron-forward" as IoniconName} size={16} color={NEO_MUTED} />
            </View>
          </TouchableOpacity>

          <View style={editStyles.divider} />

          <TouchableOpacity style={editStyles.row} activeOpacity={0.7} onPress={async () => {
            if (account?.address) {
              await Clipboard.setStringAsync(account.address);
              setAddrCopied(true);
              setTimeout(() => setAddrCopied(false), 2000);
            }
          }}>
            <Text style={editStyles.rowLabel}>Alamat Akun</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={editStyles.rowAddress}>
                {account?.address ? `${account.address.slice(0, 8)}...${account.address.slice(-6)}` : "—"}
              </Text>
              <Ionicons name={(addrCopied ? "checkmark-circle" : "copy-outline") as IoniconName} size={14} color={addrCopied ? "#22C55E" : NEO_MUTED} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={[editStyles.section, { marginTop: 16 }]}>
          <TouchableOpacity style={editStyles.row} activeOpacity={0.7} onPress={openPrivateKey}>
            <Text style={editStyles.rowLabel}>Tampilkan Kunci Privat</Text>
            <Ionicons name={"chevron-forward" as IoniconName} size={16} color={NEO_MUTED} />
          </TouchableOpacity>
        </View>

        <View style={[editStyles.section, { marginTop: 16 }]}>
          <TouchableOpacity style={editStyles.row} activeOpacity={0.7} onPress={() => {
            if (Platform.OS === "web") {
              const ok = window.confirm("Hapus akun ini?\n\nAkun akan dihapus dari daftar. Pastikan Anda memiliki frasa pemulihan untuk mengaksesnya kembali.");
              if (ok && account) void removeAccount(account.id).then(() => onClose());
            } else {
              Alert.alert("Hapus Akun", "Akun akan dihapus dari daftar. Pastikan Anda memiliki frasa pemulihan untuk mengaksesnya kembali.", [
                { text: "Batal", style: "cancel" },
                { text: "Hapus", style: "destructive", onPress: async () => { if (account) { await removeAccount(account.id); onClose(); } } },
              ]);
            }
          }}>
            <Text style={[editStyles.rowLabel, { color: "#EF4444" }]}>Hapus Akun</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Edit Name sub-screen (slides over from right) */}
      {showEditName && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: NEO_BG, transform: [{ translateX: nameSlideAnim }] },
            { paddingTop: topPad, paddingBottom: bottomPad + 16 },
          ]}
        >
          <View style={editStyles.header}>
            <TouchableOpacity onPress={closeEditName} style={editStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
            </TouchableOpacity>
            <Text style={editStyles.headerTitle}>Nama Akun</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Avatar */}
          <View style={editStyles.avatarSection}>
            <View style={[editStyles.avatarCircle, { backgroundColor: account.color + "22", borderColor: account.color, borderWidth: 2 }]}>
              <Text style={[editStyles.avatarText, { color: account.color }]}>{account.initial}</Text>
            </View>
            <View style={editStyles.avatarEditBtn}>
              <Ionicons name={"pencil" as IoniconName} size={12} color="#fff" />
            </View>
          </View>

          <Text style={editStyles.editNameTitle}>Nama Akun</Text>

          {/* Name input */}
          <View style={[editStyles.inputWrap, { marginHorizontal: 20, marginTop: 8 }]}>
            <TextInput
              style={editStyles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Masukkan nama akun"
              placeholderTextColor={NEO_MUTED}
              autoFocus
              autoCorrect={false}
            />
          </View>

          {/* Cancel / Save buttons */}
          <View style={[editStyles.btnRow, { position: "absolute", bottom: bottomPad + 24, left: 20, right: 20 }]}>
            <TouchableOpacity style={editStyles.cancelBtn} activeOpacity={0.8} onPress={closeEditName}>
              <Text style={editStyles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[editStyles.saveBtn, !editName.trim() && { opacity: 0.5 }]}
              activeOpacity={0.85}
              disabled={!editName.trim()}
              onPress={async () => {
                if (account && editName.trim()) {
                  await updateAccountName(account.id, editName.trim());
                  account.label = editName.trim();
                  account.initial = editName.trim().slice(0, 1).toUpperCase();
                }
                closeEditName();
              }}
            >
              <Text style={editStyles.saveBtnText}>Simpan</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Private Key sub-screen */}
      {showPrivateKey && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: NEO_BG, transform: [{ translateX: pkSlideAnim }] },
            { paddingTop: topPad, paddingBottom: bottomPad + 16 },
          ]}
        >
          {/* Header */}
          <View style={editStyles.header}>
            <TouchableOpacity onPress={closePrivateKey} style={editStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
            </TouchableOpacity>
            <Text style={editStyles.headerTitle}>Kunci Privat</Text>
            <View style={{ width: 40 }} />
          </View>

          {pkStep === 0 && (
            /* === Tahap 1: Password === */
            <View style={{ flex: 1, paddingHorizontal: 24 }}>
              <View style={{ alignItems: "center", marginTop: 48, marginBottom: 28 }}>
                <View style={editStyles.pkWarningCircle}>
                  <Ionicons name={"warning" as IoniconName} size={36} color="#fff" />
                </View>
              </View>
              <Text style={editStyles.pkWarningText}>
                Masukkan kata sandi untuk membuka{"\n"}Kunci Privat Anda
              </Text>
              <View style={[editStyles.inputWrap, { marginTop: 28, flexDirection: "row", alignItems: "center" }]}>
                <TextInput
                  style={[editStyles.nameInput, { flex: 1 }]}
                  value={pkPassword}
                  onChangeText={setPkPassword}
                  placeholder="Kata Sandi"
                  placeholderTextColor={NEO_MUTED}
                  secureTextEntry={!pkShowPass}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setPkShowPass(!pkShowPass)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={(pkShowPass ? "eye-off-outline" : "eye-outline") as IoniconName} size={20} color={NEO_MUTED} />
                </TouchableOpacity>
              </View>
              {!!pkError && (
                <Text style={{ color: "#EF4444", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 12 }}>{pkError}</Text>
              )}
              <TouchableOpacity
                style={[editStyles.pkContinueBtn, !pkPassword.trim() && { opacity: 0.45 }]}
                activeOpacity={0.85}
                disabled={!pkPassword.trim()}
                onPress={async () => {
                  const ok = await verifyPassword(pkPassword);
                  if (!ok) { setPkError("Kata sandi salah"); return; }
                  setPkError("");
                  setPkChecked(false);
                  // Derive real private keys (classical + quantum)
                  const mnemonic = await getMnemonic();
                  if (mnemonic) {
                    const idx = account?.accountIndex ?? 0;
                    const key = await deriveKey(mnemonic, idx);
                    setRevealedKey(key.privateKeyHex);
                    const qkey = await deriveQuantumKey(mnemonic, idx);
                    setRevealedQuantumKey(qkey.secretKeyHex);
                  }
                  setPkStep(1);
                }}
              >
                <Text style={editStyles.pkContinueBtnText}>Lanjutkan</Text>
              </TouchableOpacity>
            </View>
          )}

          {pkStep === 1 && (
            /* === Tahap 2: Warning / disclaimer === */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: "center", marginTop: 36, marginBottom: 24 }}>
                <View style={editStyles.pkWarningCircle}>
                  <Ionicons name={"shield" as IoniconName} size={34} color="#fff" />
                </View>
              </View>

              <Text style={editStyles.pkSecretTitle}>Jaga Kerahasiaan{"\n"}Kunci Privat Anda</Text>

              {/* Bullet 1 */}
              <View style={editStyles.pkBulletRow}>
                <View style={editStyles.pkBulletIcon}>
                  <Ionicons name={"key" as IoniconName} size={16} color="#fff" />
                </View>
                <Text style={editStyles.pkBulletText}>
                  Kunci privat Anda seperti <Text style={{ fontFamily: "Inter_700Bold", color: NEO_TEXT }}>kata sandi untuk akun</Text> Anda.
                </Text>
              </View>

              {/* Bullet 2 */}
              <View style={editStyles.pkBulletRow}>
                <View style={editStyles.pkBulletIcon}>
                  <Ionicons name={"eye-off" as IoniconName} size={16} color="#fff" />
                </View>
                <Text style={editStyles.pkBulletText}>
                  Jika seseorang mendapatkannya, mereka dapat <Text style={{ fontFamily: "Inter_700Bold", color: NEO_TEXT }}>menguras dompet Anda. Tidak ada cara untuk memulihkan dana yang hilang</Text>.
                </Text>
              </View>

              {/* Bullet 3 */}
              <View style={editStyles.pkBulletRow}>
                <View style={editStyles.pkBulletIcon}>
                  <Ionicons name={"ban" as IoniconName} size={16} color="#fff" />
                </View>
                <Text style={editStyles.pkBulletText}>
                  Jangan pernah membagikannya kepada siapa pun—tidak ada orang, situs web, atau aplikasi.
                </Text>
              </View>

              {/* Checkbox */}
              <TouchableOpacity style={editStyles.pkCheckRow} activeOpacity={0.8} onPress={() => setPkChecked(!pkChecked)}>
                <View style={[editStyles.pkCheckBox, pkChecked && { backgroundColor: NEO_ACCENT, borderColor: NEO_ACCENT }]}>
                  {pkChecked && <Ionicons name={"checkmark" as IoniconName} size={14} color="#fff" />}
                </View>
                <Text style={editStyles.pkCheckText}>
                  Saya mengerti bahwa berbagi kunci privat dapat mengakibatkan{" "}
                  <Text style={{ fontFamily: "Inter_700Bold", color: NEO_TEXT }}>kehilangan dana secara permanen</Text>.
                </Text>
              </TouchableOpacity>

              {/* Continue */}
              <TouchableOpacity
                style={[editStyles.pkContinueBtn, !pkChecked && { opacity: 0.4 }]}
                activeOpacity={0.85}
                disabled={!pkChecked}
                onPress={() => setPkStep(2)}
              >
                <Text style={editStyles.pkContinueBtnText}>Lanjutkan</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {pkStep === 2 && (
            /* === Tahap 3: Revealed key === */
            <View style={{ flex: 1, paddingHorizontal: 20 }}>
              {/* Red danger banner */}
              <View style={editStyles.pkDangerBanner}>
                <Text style={editStyles.pkDangerTitle}>
                  Jangan{" "}
                  <Text style={{ textDecorationLine: "underline" }}>pernah</Text>
                  {" "}bagikan Kunci Privat Anda!
                </Text>
                <Text style={editStyles.pkDangerSub}>
                  Jika seseorang memiliki Kunci Privat Anda, mereka akan memiliki kendali penuh atas dompet Anda.
                </Text>
              </View>

              {/* Quantum key (ML-DSA-87) — primary */}
              <Text style={[editStyles.pkKeyLabel, { marginTop: 12 }]}>Kunci Privat Quantum (ML-DSA-87)</Text>
              <View style={editStyles.pkKeyBox}>
                <Text style={[editStyles.pkKeyText, { fontSize: 10, lineHeight: 16 }]} selectable numberOfLines={4}>
                  {revealedQuantumKey ? revealedQuantumKey.slice(0, 128) + "..." : "—"}
                </Text>
              </View>
              <TouchableOpacity style={editStyles.pkCopyBtn} activeOpacity={0.8} onPress={async () => {
                if (revealedQuantumKey) {
                  await Clipboard.setStringAsync(revealedQuantumKey);
                  setQkCopied(true);
                  setTimeout(() => setQkCopied(false), 2000);
                }
              }}>
                <Ionicons name={(qkCopied ? "checkmark-circle" : "copy-outline") as IoniconName} size={16} color={qkCopied ? "#22C55E" : NEO_TEXT} style={{ marginRight: 6 }} />
                <Text style={[editStyles.pkCopyBtnText, qkCopied && { color: "#22C55E" }]}>{qkCopied ? "Tersalin!" : "Salin Kunci Quantum"}</Text>
              </TouchableOpacity>

              {/* Classical key (secp256k1) */}
              <Text style={[editStyles.pkKeyLabel, { marginTop: 16 }]}>Kunci Privat Classical (secp256k1)</Text>
              <View style={editStyles.pkKeyBox}>
                <Text style={editStyles.pkKeyText} selectable>{revealedKey || "—"}</Text>
              </View>
              <TouchableOpacity style={editStyles.pkCopyBtn} activeOpacity={0.8} onPress={async () => {
                if (revealedKey) {
                  await Clipboard.setStringAsync(revealedKey);
                  setPkCopied(true);
                  setTimeout(() => setPkCopied(false), 2000);
                }
              }}>
                <Ionicons name={(pkCopied ? "checkmark-circle" : "copy-outline") as IoniconName} size={16} color={pkCopied ? "#22C55E" : NEO_TEXT} style={{ marginRight: 6 }} />
                <Text style={[editStyles.pkCopyBtnText, pkCopied && { color: "#22C55E" }]}>{pkCopied ? "Tersalin!" : "Salin Kunci Classical"}</Text>
              </TouchableOpacity>

              {/* Done button pinned at bottom */}
              <TouchableOpacity
                style={[editStyles.pkContinueBtn, { position: "absolute", bottom: bottomPad + 24, left: 20, right: 20, marginTop: 0 }]}
                activeOpacity={0.85}
                onPress={closePrivateKey}
              >
                <Text style={editStyles.pkContinueBtnText}>Selesai</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
    </>
  );
}

const editStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "3px 3px 7px #D1D5DD, -3px -3px 7px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },
    }),
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  avatarSection: { alignItems: "center", paddingVertical: 32, position: "relative" },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "5px 5px 12px #D1D5DD, -5px -5px 12px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 4 },
    }),
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  avatarEditBtn: {
    position: "absolute",
    bottom: 26, right: "35%",
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: NEO_ACCENT,
    alignItems: "center", justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "2px 2px 6px #D1D5DD" },
      default: { shadowColor: "#C8922A", shadowOffset: { width: 1, height: 1 }, shadowOpacity: 0.6, shadowRadius: 4, elevation: 4 },
    }),
  },
  section: {
    marginHorizontal: 20,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select<object>({
      web: { boxShadow: "5px 5px 12px #D1D5DD, -5px -5px 12px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 4 },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginHorizontal: 16 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  rowAddress: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, letterSpacing: 0.3 },
  editNameTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_TEXT, textAlign: "center", marginTop: 8, marginBottom: 20 },
  inputWrap: {
    backgroundColor: "#E8E8EC",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...Platform.select({
      web: { boxShadow: "inset 2px 2px 5px #D1D5DD, inset -2px -2px 5px #FFFFFF" } as any,
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 1, height: 1 }, shadowOpacity: 1, shadowRadius: 3, elevation: 2 },
    }),
  },
  nameInput: { fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_TEXT, height: 48, outlineStyle: "none" } as any,
  btnRow: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center",
    backgroundColor: "#E2E2E6",
    ...Platform.select({
      web: { boxShadow: "3px 3px 7px #D1D5DD, -3px -3px 7px #FFFFFF" } as any,
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
    }),
  },
  cancelBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  saveBtn: {
    flex: 1, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center",
    backgroundColor: NEO_ACCENT,
    ...Platform.select({
      web: { boxShadow: "3px 3px 7px #b07a22, -2px -2px 6px #e8b050" } as any,
      default: { shadowColor: "#b07a22", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
    }),
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  pkWarningCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#EF4444",
    justifyContent: "center", alignItems: "center",
    ...Platform.select({
      web: { boxShadow: "0 6px 20px rgba(239,68,68,0.4)" } as any,
      default: { shadowColor: "#EF4444", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
    }),
  },
  pkWarningText: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED,
    textAlign: "center", lineHeight: 22,
  },
  pkContinueBtn: {
    marginTop: 32, height: 52, borderRadius: 14,
    backgroundColor: "#3D3D3D",
    justifyContent: "center", alignItems: "center", flexDirection: "row",
    ...Platform.select({
      web: { boxShadow: "2px 2px 8px #D1D5DD, -2px -2px 8px #FFFFFF" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 },
    }),
  },
  pkContinueBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  pkSecretTitle: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: NEO_TEXT,
    textAlign: "center", lineHeight: 30, marginBottom: 28,
  },
  pkBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 18 },
  pkBulletIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "#EF4444",
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  pkBulletText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 21 },
  pkCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 24, marginBottom: 8 },
  pkCheckBox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: NEO_MUTED,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  pkCheckText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 21 },
  pkDangerBanner: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1, borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 14, padding: 16, marginTop: 20, marginBottom: 20,
  },
  pkDangerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#EF4444", textAlign: "center", marginBottom: 6 },
  pkDangerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", textAlign: "center", lineHeight: 20, opacity: 0.85 },
  pkKeyBox: {
    backgroundColor: NEO_BG, borderRadius: 14, padding: 18, marginBottom: 0,
    ...Platform.select({
      web: { boxShadow: "inset 2px 2px 6px #D1D5DD, inset -2px -2px 6px #FFFFFF" } as any,
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 1, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
    }),
  },
  pkKeyLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, marginBottom: 6, letterSpacing: 0.4 },
  pkKeyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, textAlign: "center", lineHeight: 26, letterSpacing: 0.3 },
  pkCopyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)",
    marginTop: 0,
  },
  pkCopyBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT },
});

function ManageAccountsSheet({
  visible,
  onClose,
  activeWallet,
  accounts,
  onAddAccount,
  onSwitchAccount,
  topPad,
  bottomPad,
}: {
  visible: boolean;
  onClose: () => void;
  activeWallet: string;
  accounts: WalletItem[];
  onAddAccount: () => void;
  onSwitchAccount: (id: string) => void;
  topPad: number;
  bottomPad: number;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [showEdit, setShowEdit] = useState(false);
  const [editAcc, setEditAcc] = useState<WalletItem | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: false }).start();
      setShowEdit(false);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: NEO_BG, transform: [{ translateX: slideAnim }] },
          { paddingTop: topPad },
        ]}
      >
        {/* Header */}
        <View style={manageStyles.header}>
          <TouchableOpacity onPress={onClose} style={manageStyles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
          </TouchableOpacity>
          <Text style={manageStyles.headerTitle}>Kelola Akun</Text>
          <TouchableOpacity style={manageStyles.iconBtn} onPress={onAddAccount}>
            <Ionicons name="add" size={24} color={NEO_TEXT} />
          </TouchableOpacity>
        </View>

        {/* Account list */}
        <ScrollView style={manageStyles.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          {accounts.map((acc) => {
            const isActive = acc.id === activeWallet;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  manageStyles.accountRow,
                  isActive && { borderWidth: 1.5, borderColor: acc.color + "88" },
                ]}
                onPress={() => { onSwitchAccount(acc.id); onClose(); }}
                activeOpacity={0.75}
              >
                {/* Avatar */}
                <View style={[manageStyles.accountAvatar, { backgroundColor: acc.color + "33" }]}>
                  <Text style={[manageStyles.accountInitial, { color: acc.color }]}>{acc.initial}</Text>
                </View>

                {/* Name */}
                <Text style={manageStyles.accountName}>{acc.label}</Text>

                {isActive && <Ionicons name="checkmark-circle" size={18} color={NEO_ACCENT} style={{ marginLeft: "auto", marginRight: 8 }} />}

                {/* Drag dots — opens edit */}
                <TouchableOpacity
                  style={{ padding: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                  onPress={(e) => { e.stopPropagation?.(); setEditAcc(acc); setShowEdit(true); }}
                >
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    {[0, 1].map((col) => (
                      <View key={col} style={{ gap: 3 }}>
                        {[0, 1, 2].map((row) => (
                          <View key={row} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: NEO_MUTED }} />
                        ))}
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Add Account button */}
        <TouchableOpacity
          style={[manageStyles.addBtn, { marginHorizontal: 20, marginBottom: bottomPad + 16 }]}
          activeOpacity={0.8}
          onPress={onAddAccount}
        >
          <Text style={manageStyles.addBtnText}>Tambah Akun</Text>
        </TouchableOpacity>

        {/* EditAccountSheet rendered inside same Modal so it can slide over */}
        <EditAccountSheet
          visible={showEdit}
          account={editAcc}
          onClose={() => setShowEdit(false)}
          topPad={topPad}
          bottomPad={bottomPad}
        />
      </Animated.View>
    </Modal>
  );
}

const ADD_ACCOUNT_OPTIONS = [
  {
    key: "create",
    icon: "add-circle-outline",
    title: "Buat Akun Baru",
    desc: "Tambah akun multi-chain baru",
  },
  {
    key: "phrase",
    icon: "document-text-outline",
    title: "Impor Frasa Pemulihan",
    desc: "Impor akun dari dompet lain",
  },
  {
    key: "privatekey",
    icon: "download-outline",
    title: "Impor Kunci Privat",
    desc: "Impor akun single-chain",
  },
  {
    key: "watch",
    icon: "eye-outline",
    title: "Pantau Alamat",
    desc: "Lacak alamat dompet publik mana saja",
  },
] as const;

function AddAccountSheet({
  visible,
  onClose,
  bottomPad,
  topPad,
}: {
  visible: boolean;
  onClose: () => void;
  bottomPad: number;
  topPad: number;
}) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-700)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -700, duration: 220, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[addStyles.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[addStyles.sheet, { paddingTop: topPad, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Header */}
          <View style={addStyles.header}>
            <TouchableOpacity onPress={onClose} style={addStyles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#8492A6" />
            </TouchableOpacity>
            <Text style={addStyles.headerTitle}>Tambah Akun</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Options */}
          <View style={addStyles.options}>
            {ADD_ACCOUNT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={addStyles.optionRow}
                activeOpacity={0.7}
                onPress={() => {
                  if (opt.key === "create") { onClose(); router.push("/buat-akun"); return; }
                  if (opt.key === "watch") { onClose(); router.push("/pantau-alamat"); return; }
                  if (opt.key === "privatekey") { onClose(); router.push("/impor-kunci-privat"); return; }
                  if (opt.key === "phrase") { onClose(); router.push("/impor-akun-frasa"); return; }
                }}
              >
                <View style={addStyles.optionIcon}>
                  <Ionicons name={opt.icon as IoniconName} size={22} color="#C8922A" />
                </View>
                <View style={addStyles.optionText}>
                  <Text style={addStyles.optionTitle}>{opt.title}</Text>
                  <Text style={addStyles.optionDesc}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DD" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Close button */}
          <TouchableOpacity
            style={addStyles.closeBar}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={addStyles.closeBarText}>Tutup</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}


const CRYPTO_ASSETS = [
  // ── Kripto ───────────────────────────────────────────────────────────────
  { id: "grd",  name: "GarudaChain",    symbol: "GRD",  color: "#C8922A", letter: "G", category: "Kripto",      price: "Native",    change: "—",      positive: true  },

  // ── Stablecoin ───────────────────────────────────────────────────────────
  { id: "usdt", name: "Tether USD",     symbol: "USDT", color: "#26A17B", letter: "₮", category: "Stablecoin",  price: "Rp 16.287", change: "+0,12%", positive: true  },
  { id: "usdc", name: "USD Coin",       symbol: "USDC", color: "#2775CA", letter: "◎", category: "Stablecoin",  price: "Rp 16.290", change: "+0,08%", positive: true  },
  { id: "idrx", name: "IDRX",           symbol: "IDRX", color: "#E63946", letter: "₨", category: "Stablecoin",  price: "Rp 1",      change: "0,00%",  positive: true  },
  { id: "dai",  name: "Dai",            symbol: "DAI",  color: "#F5AC37", letter: "◈", category: "Stablecoin",  price: "Rp 16.288", change: "+0,05%", positive: true  },

  // ── Pasar Saham ──────────────────────────────────────────────────────────
  { id: "bbca", name: "Bank BCA",       symbol: "BBCA", color: "#003087", letter: "B", category: "Pasar Saham", price: "Rp 9.825",  change: "+1,24%", positive: true  },
  { id: "bbri", name: "Bank BRI",       symbol: "BBRI", color: "#003D82", letter: "B", category: "Pasar Saham", price: "Rp 4.180",  change: "-0,48%", positive: false },
  { id: "bmri", name: "Bank Mandiri",   symbol: "BMRI", color: "#1A3C8F", letter: "M", category: "Pasar Saham", price: "Rp 6.450",  change: "+0,78%", positive: true  },
  { id: "tlkm", name: "Telkom",         symbol: "TLKM", color: "#CC0000", letter: "T", category: "Pasar Saham", price: "Rp 3.090",  change: "-1,13%", positive: false },
  { id: "goto", name: "GoTo",           symbol: "GOTO", color: "#00AA13", letter: "G", category: "Pasar Saham", price: "Rp 82",     change: "+2,50%", positive: true  },
  { id: "asii", name: "Astra Intl",    symbol: "ASII", color: "#1A3C8F", letter: "A", category: "Pasar Saham", price: "Rp 4.470",  change: "-0,22%", positive: false },
  { id: "antm", name: "Aneka Tambang",  symbol: "ANTM", color: "#5C7A29", letter: "A", category: "Pasar Saham", price: "Rp 1.695",  change: "+3,35%", positive: true  },
];

const TABS = [
  { key: "home", label: "Rumah", icon: "home" },
  { key: "p2p", label: "P2P", icon: "swap-horizontal" },
  { key: "swap", label: "Menukar", icon: "repeat" },
  { key: "activity", label: "Aktivitas", icon: "pulse" },
  { key: "cari", label: "Cari", icon: "search" },
] as const;

const ACTIONS = [
  { key: "beli", label: "Beli", icon: "logo-usd" },
  { key: "swap", label: "Swap", icon: "swap-vertical" },
  { key: "kirim", label: "Kirim", icon: "arrow-forward" },
  { key: "terima", label: "Terima", icon: "arrow-down" },
] as const;

function WalletPanel({
  visible,
  onClose,
  activeWallet,
  accounts,
  onSelectWallet,
  onAddAccount,
  onManageAccounts,
  onSettings,
  topPad,
  bottomPad,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  activeWallet: string;
  accounts: WalletItem[];
  onSelectWallet: (id: string) => void;
  onAddAccount: () => void;
  onManageAccounts: () => void;
  onSettings: () => void;
  topPad: number;
  bottomPad: number;
  colors: any;
}) {
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [hoveredWallet, setHoveredWallet] = useState<string | null>(null);
  const [activeFooterTip, setActiveFooterTip] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      ]).start();
    } else {
      setHoveredWallet(null);
      setActiveFooterTip(null);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -PANEL_WIDTH, duration: 200, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  const showTip = (key: string) => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setActiveFooterTip(key);
    tipTimer.current = setTimeout(() => setActiveFooterTip(null), 1800);
  };

  const handleWalletTap = (id: string) => {
    if (hoveredWallet === id) {
      onSelectWallet(id);
      onClose();
    } else {
      setHoveredWallet(id);
    }
  };

  const hoveredData = accounts.find((w) => w.id === hoveredWallet);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={() => { setHoveredWallet(null); setActiveFooterTip(null); onClose(); }}>
          <Animated.View style={[panelStyles.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            panelStyles.panel,
            {
              backgroundColor: NEO_BG,
              paddingTop: topPad + 8,
              paddingBottom: bottomPad + 16,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={panelStyles.backRow}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={NEO_TEXT} />
            <Text style={panelStyles.backLabel}>baru</Text>
          </TouchableOpacity>

          <ScrollView style={panelStyles.walletList} showsVerticalScrollIndicator={false}>
            {accounts.map((w) => {
              const isActive = w.id === activeWallet;
              const isHovered = w.id === hoveredWallet;
              return (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    panelStyles.walletItem,
                    isActive && { backgroundColor: "rgba(200,146,42,0.14)" },
                    isHovered && !isActive && { backgroundColor: "rgba(0,0,0,0.05)" },
                  ]}
                  onPress={() => handleWalletTap(w.id)}
                  activeOpacity={0.7}
                >
                  <View style={[panelStyles.walletAvatar, { backgroundColor: w.color + "33", borderColor: isActive ? w.color : "transparent", borderWidth: isActive ? 2 : 0 }]}>
                    <Text style={[panelStyles.walletAvatarText, { color: w.color }]}>{w.initial}</Text>
                  </View>
                  <Text style={[panelStyles.walletLabel, { color: isActive ? NEO_TEXT : NEO_MUTED }]}>
                    {w.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={16} color="#C8922A" style={{ marginLeft: "auto" }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={panelStyles.panelFooter}>
            <View>
              <TouchableOpacity style={panelStyles.footerBtn} onPress={onAddAccount}>
                <Ionicons name="add" size={22} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>
            <View>
              <TouchableOpacity style={panelStyles.footerBtn} onPress={onManageAccounts}>
                <Ionicons name="pencil-outline" size={20} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>
            <View>
              <TouchableOpacity style={panelStyles.footerBtn} onPress={onSettings}>
                <Ionicons name="settings-outline" size={20} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {hoveredData && (
          <View style={[panelStyles.accountPopup, { top: topPad + 60 }]}>
            <View style={panelStyles.accountPopupRow}>
              <Text style={panelStyles.accountPopupName}>{hoveredData.label}</Text>
              <Text style={panelStyles.accountPopupBalance}>$0.00</Text>
            </View>
            <View style={panelStyles.accountPopupNetwork}>
              <View style={[panelStyles.networkIcon, { backgroundColor: "#C8922A" }]}>
                <Text style={panelStyles.networkIconText}>G</Text>
              </View>
              <Text style={panelStyles.networkName}>GarudaChain</Text>
              <Text style={panelStyles.networkAddress}>grd1q...</Text>
              <Ionicons name="copy-outline" size={14} color={NEO_MUTED} />
            </View>
            <Text style={panelStyles.accountPopupHint}>Ketuk lagi untuk pilih</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}



const POPULAR_ASSETS = [
  // ── Layer 1 ──────────────────────────────────────────────────────────────
  { id: "grd",  name: "GarudaChain",  symbol: "GRD",  color: "#C8922A", letter: "G", price: "Native",        change: "—",      positive: true,  category: "Layer 1" },

  // ── Stablecoin ───────────────────────────────────────────────────────────
  { id: "usdt", name: "Tether USD",   symbol: "USDT", color: "#26A17B", letter: "₮", price: "Rp 16.287",     change: "+0,12%", positive: true,  category: "Stablecoin" },
  { id: "usdc", name: "USD Coin",     symbol: "USDC", color: "#2775CA", letter: "◎", price: "Rp 16.290",     change: "+0,08%", positive: true,  category: "Stablecoin" },
  { id: "idrx", name: "IDRX",         symbol: "IDRX", color: "#E63946", letter: "₨", price: "Rp 1",          change: "0,00%",  positive: true,  category: "Stablecoin" },
  { id: "dai",  name: "Dai",          symbol: "DAI",  color: "#F5AC37", letter: "◈", price: "Rp 16.288",     change: "+0,05%", positive: true,  category: "Stablecoin" },

  // ── Saham Tokenisasi ─────────────────────────────────────────────────────
  { id: "bbca", name: "Bank BCA",     symbol: "BBCA", color: "#003087", letter: "B", price: "Rp 9.825",      change: "+1,24%", positive: true,  category: "Saham" },
  { id: "bbri", name: "Bank BRI",     symbol: "BBRI", color: "#003D82", letter: "B", price: "Rp 4.180",      change: "-0,48%", positive: false, category: "Saham" },
  { id: "bmri", name: "Bank Mandiri", symbol: "BMRI", color: "#003087", letter: "M", price: "Rp 6.450",      change: "+0,78%", positive: true,  category: "Saham" },
  { id: "tlkm", name: "Telkom",       symbol: "TLKM", color: "#CC0000", letter: "T", price: "Rp 3.090",      change: "-1,13%", positive: false, category: "Saham" },
  { id: "goto", name: "GoTo",         symbol: "GOTO", color: "#00AA13", letter: "G", price: "Rp 82",         change: "+2,50%", positive: true,  category: "Saham" },
  { id: "asii", name: "Astra Intl",  symbol: "ASII", color: "#1A3C8F", letter: "A", price: "Rp 4.470",      change: "-0,22%", positive: false, category: "Saham" },
  { id: "unvr", name: "Unilever",     symbol: "UNVR", color: "#1F36C7", letter: "U", price: "Rp 2.150",      change: "+0,47%", positive: true,  category: "Saham" },
  { id: "antm", name: "Aneka Tambang",symbol: "ANTM", color: "#5C7A29", letter: "A", price: "Rp 1.695",      change: "+3,35%", positive: true,  category: "Saham" },
];

const SEARCH_CATEGORIES = ["Semua", "Layer 1", "Stablecoin", "Saham"];



const P2P_NAV_TABS = [
  { key: "p2p",     label: "P2P",     icon: "people",           iconOutline: "people-outline" },
  { key: "order",   label: "Order",   icon: "receipt",          iconOutline: "receipt-outline" },
  { key: "iklan",   label: "Iklan",   icon: "megaphone",        iconOutline: "megaphone-outline" },
  { key: "obrolan", label: "Obrolan", icon: "chatbubbles",      iconOutline: "chatbubbles-outline" },
  { key: "profil",  label: "Profil",  icon: "person-circle",    iconOutline: "person-circle-outline" },
] as const;

type P2PSubTab = "p2p" | "order" | "iklan" | "obrolan" | "profil";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return "Baru saja";
  if (min < 60) return `${min} mnt lalu`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function TabP2P() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<P2PSubTab>("p2p");
  const [tradeSide, setTradeSide] = useState<"beli" | "jual">("beli");
  const [filterAsset, setFilterAsset] = useState("USDT");
  const [filterJumlahIdr, setFilterJumlahIdr] = useState("");
  const [showJumlahSheet, setShowJumlahSheet] = useState(false);
  const [showPembayaranSheet, setShowPembayaranSheet] = useState(false);
  const [pembayaranSearch, setPembayaranSearch] = useState("");
  const [filterPembayaran, setFilterPembayaran] = useState<string[]>([]);
  const [myListings, setMyListings] = useState<P2PMyListing[]>([]);
  const [realOrders, setRealOrders] = useState<P2POrder[]>([]);
  const [walletName, setWalletName] = useState("Pengguna");

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await processAutoReleases();
        const [orders, listings, account] = await Promise.all([
          getAllOrders(), getMyListings(), getActiveAccount(),
        ]);
        setRealOrders(orders);
        setMyListings(listings);
        if (account) setWalletName(account.name);
      })();
    }, [subTab]) // re-load saat screen fokus kembali atau subtab berganti
  );

  // Orders I placed as buyer
  const myPlacedOrders = realOrders.filter((o) => o.myRole === "buyer");
  // Orders I received as seller/exchanger
  const incomingOrders = realOrders.filter((o) => o.myRole === "seller");
  // All active (not cancelled) orders for chat list
  const activeChats = realOrders.filter((o) => o.status !== "dibatalkan");

  /* derive listings dari iklan aktif yang dibuat admin via AsyncStorage */
  const filtered = myListings
    .filter((l) => {
      if (l.status !== "aktif") return false;
      const sideMatch = tradeSide === "beli" ? l.type === "jual" : l.type === "beli";
      const assetMatch = l.asset === filterAsset;
      const payMatch =
        filterPembayaran.length === 0 ||
        filterPembayaran.some((fp) =>
          l.payments.some((p) => p.method.toLowerCase().includes(fp.toLowerCase()))
        );
      return sideMatch && assetMatch && payMatch;
    })
    .map((l) => ({
      id: l.id,
      side: l.type,
      asset: l.asset,
      trader: "Admin",
      badge: "✅",
      verified: true,
      promoted: false,
      trades: l.orders,
      completion: 100.0,
      thumbsUp: 100.0,
      priceNum: l.priceNum,
      limitMin: l.limitMin,
      limitMax: l.limitMax,
      tersedia: +(l.limitMax / l.priceNum).toFixed(2),
      tersediaAsset: l.asset,
      payments: l.payments.map((p) => p.method),
      timeLimit: l.timeLimit ?? 15,
    }));

  const pendingOrders = realOrders.filter(o => o.status === "menunggu" || o.status === "dibayar").length;
  const unreadChats   = activeChats.length;
  const incomingPending = myListings.length > 0 ? incomingOrders.filter(o => o.status === "menunggu").length : 0;

  const toggleStatus = (id: string) => {
    setMyListings((prev) => {
      const updated = prev.map((l) =>
        l.id === id ? { ...l, status: (l.status === "aktif" ? "nonaktif" : "aktif") as "aktif" | "nonaktif" } : l
      );
      void saveMyListings(updated);
      return updated;
    });
  };

  const deleteListing = (id: string) => {
    Alert.alert("Hapus Iklan?", "Iklan ini akan dihapus permanen.", [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus", style: "destructive",
        onPress: () => {
          setMyListings((prev) => {
            const updated = prev.filter((l) => l.id !== id);
            void saveMyListings(updated);
            return updated;
          });
        },
      },
    ]);
  };

  const orderStatusColor = (s: string) => s === "menunggu" ? "#F59E0B" : s === "dibayar" ? "#3B82F6" : "#22C55E";
  const orderStatusLabel = (s: string) => s === "menunggu" ? "Menunggu" : s === "dibayar" ? "Sudah Dibayar" : "Selesai";

  const formatRp = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 3).replace(/\.?0+$/, "") + " Jt";
    if (n >= 1_000) return n.toLocaleString("id-ID");
    return String(n);
  };
  const JUMLAH_QUICK = [
    { label: "Rp20K", value: "20000" },
    { label: "Rp100K", value: "100000" },
    { label: "Rp500K", value: "500000" },
    { label: "Rp1M", value: "1000000" },
  ];

  const ALL_PAYMENT_METHODS = [
    { name: "Semua", popular: false },
    { name: "Transfer Bank", popular: true },
    { name: "BCA", popular: true },
    { name: "Bank Mandiri", popular: true },
    { name: "SEA Bank", popular: false },
    { name: "Bank BRI", popular: true },
    { name: "Aladin Bank", popular: false },
    { name: "Allo Bank", popular: false },
    { name: "Bank Jago", popular: false },
    { name: "Bank Permata", popular: false },
    { name: "BCA lightning", popular: false },
    { name: "BCA (QR) lightning", popular: false },
    { name: "Blu", popular: false },
    { name: "BNI (QR) lightning", popular: false },
    { name: "BNI lightning", popular: false },
    { name: "BRI (QR) lightning", popular: false },
    { name: "BRI lightning", popular: false },
    { name: "BSI", popular: false },
    { name: "CIMB Niaga", popular: false },
    { name: "Dana (QR) lightning", popular: false },
    { name: "DANA(Indonesia)", popular: false },
    { name: "Danamon Bank", popular: false },
    { name: "Danamon Bank lightning", popular: false },
    { name: "GoPay", popular: false },
    { name: "Jenius PayMe", popular: false },
    { name: "LinkAja", popular: false },
    { name: "MANDIRI (QR) lightning", popular: false },
    { name: "MANDIRI lightning", popular: false },
    { name: "OVO", popular: false },
    { name: "ShopeePay", popular: false },
  ];

  const filteredPaymentMethods = pembayaranSearch.trim()
    ? ALL_PAYMENT_METHODS.filter((m) =>
        m.name.toLowerCase().includes(pembayaranSearch.toLowerCase())
      )
    : ALL_PAYMENT_METHODS;

  const togglePembayaran = (name: string) => {
    if (name === "Semua") { setFilterPembayaran([]); return; }
    setFilterPembayaran((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const pembayaranLabel =
    filterPembayaran.length === 0
      ? "Pembayaran"
      : filterPembayaran.length === 1
      ? filterPembayaran[0]
      : `${filterPembayaran[0]} +${filterPembayaran.length - 1}`;

  return (
    <View style={{ flex: 1 }}>
      {/* ── 5-Tab navigation bar (icon above text) ── */}
      <View style={tabContentStyles.p2pNavBar}>
        {P2P_NAV_TABS.map((tab) => {
          const active = subTab === tab.key;
          const badge = tab.key === "order" ? pendingOrders : tab.key === "obrolan" ? unreadChats : tab.key === "profil" ? incomingPending : 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={tabContentStyles.p2pNavItem}
              onPress={() => setSubTab(tab.key as P2PSubTab)}
              activeOpacity={0.75}
            >
              <View style={tabContentStyles.p2pNavIconWrap}>
                <Ionicons
                  name={(active ? tab.icon : tab.iconOutline) as IoniconName}
                  size={22}
                  color={active ? NEO_ACCENT : NEO_MUTED}
                />
                {badge > 0 && (
                  <View style={tabContentStyles.p2pNavBadge}>
                    <Text style={tabContentStyles.p2pNavBadgeText}>{badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[tabContentStyles.p2pNavLabel, active && tabContentStyles.p2pNavLabelActive]}>
                {tab.label}
              </Text>
              {active && <View style={tabContentStyles.p2pNavIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 }} showsVerticalScrollIndicator={false}>

        {/* ── P2P (PASAR) TAB ── */}
        {subTab === "p2p" && (
          <>
            {/* Beli / Jual + filter chips */}
            <View style={tabContentStyles.p2pTopBar}>
              <View style={tabContentStyles.p2pSideToggle}>
                <TouchableOpacity
                  style={[tabContentStyles.sideBtn, tradeSide === "beli" && tabContentStyles.sideBtnActive]}
                  onPress={() => setTradeSide("beli")}
                  activeOpacity={0.85}
                >
                  <Text style={[tabContentStyles.sideBtnText, tradeSide === "beli" && tabContentStyles.sideBtnTextActive]}>Beli</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[tabContentStyles.sideBtn, tradeSide === "jual" && tabContentStyles.sideBtnActiveJual]}
                  onPress={() => setTradeSide("jual")}
                  activeOpacity={0.85}
                >
                  <Text style={[tabContentStyles.sideBtnText, tradeSide === "jual" && tabContentStyles.sideBtnTextActive]}>Jual</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={tabContentStyles.p2pAlertBtn} activeOpacity={0.8}>
                <Ionicons name="notifications-outline" size={18} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>

            {/* Filter chips row */}
            <View style={tabContentStyles.filterChipRow}>
              {/* Asset chip */}
              <TouchableOpacity style={[tabContentStyles.filterPill, neoRaisedMd]} activeOpacity={0.8}>
                <Ionicons name="logo-usd" size={13} color={NEO_ACCENT} />
                <Text style={tabContentStyles.filterPillText}>{filterAsset}</Text>
                <Ionicons name="chevron-down" size={13} color={NEO_MUTED} />
              </TouchableOpacity>
              {/* Jumlah chip */}
              <TouchableOpacity
                style={[tabContentStyles.filterPill, neoRaisedMd, filterJumlahIdr ? { borderColor: NEO_ACCENT, borderWidth: 1 } : {}]}
                onPress={() => setShowJumlahSheet(true)}
                activeOpacity={0.8}
              >
                <Text style={[tabContentStyles.filterPillText, filterJumlahIdr ? { color: NEO_ACCENT } : {}]}>
                  {filterJumlahIdr
                    ? `Rp ${parseInt(filterJumlahIdr).toLocaleString("id-ID")}`
                    : "Jumlah"}
                </Text>
                <Ionicons name="chevron-down" size={13} color={filterJumlahIdr ? NEO_ACCENT : NEO_MUTED} />
              </TouchableOpacity>
              {/* Pembayaran chip */}
              <TouchableOpacity
                style={[tabContentStyles.filterPill, neoRaisedMd, filterPembayaran.length > 0 && { borderColor: NEO_ACCENT, borderWidth: 1 }]}
                onPress={() => { setPembayaranSearch(""); setShowPembayaranSheet(true); }}
                activeOpacity={0.8}
              >
                <Text style={[tabContentStyles.filterPillText, filterPembayaran.length > 0 && { color: NEO_ACCENT }]} numberOfLines={1}>
                  {pembayaranLabel}
                </Text>
                <Ionicons name="chevron-down" size={13} color={filterPembayaran.length > 0 ? NEO_ACCENT : NEO_MUTED} />
              </TouchableOpacity>
              {/* Filter icon */}
              <TouchableOpacity style={[tabContentStyles.filterIconBtn, neoRaisedMd]} activeOpacity={0.8}>
                <Ionicons name="options-outline" size={18} color={NEO_ACCENT} />
              </TouchableOpacity>
            </View>

            {/* Iklan Promosi label */}
            {filtered.some((l) => l.promoted) && (
              <Text style={tabContentStyles.promoLabel}>Iklan Promosi</Text>
            )}

            <View style={tabContentStyles.cardList}>
              {filtered.map((listing, idx) => {
                const btnLabel = tradeSide === "beli" ? "Beli" : "Jual";
                const btnColor = tradeSide === "beli" ? "#22C55E" : "#EF4444";
                return (
                  <View key={listing.id}>
                    {/* Separator line after promoted */}
                    {idx > 0 && listing.promoted === false && filtered[idx - 1]?.promoted === true && (
                      <View style={tabContentStyles.promoSep} />
                    )}
                    <View style={[tabContentStyles.p2pCard2, neoRaisedMd]}>
                      {/* Left column */}
                      <View style={{ flex: 1 }}>
                        {/* Trader row */}
                        <View style={tabContentStyles.traderRow2}>
                          <View style={tabContentStyles.traderAvatar2}>
                            <Text style={tabContentStyles.traderAvatarText2}>{listing.trader[0]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Text style={tabContentStyles.traderName2} numberOfLines={1}>{listing.trader}</Text>
                              {listing.badge ? <Text style={{ fontSize: 13 }}>{listing.badge}</Text> : null}
                            </View>
                            <Text style={tabContentStyles.traderStats2}>
                              {"Perdagangan "}{listing.trades.toLocaleString("id-ID")}
                              {" ("}
                              {listing.completion.toFixed(2)}
                              {"%) 👍 "}
                              {listing.thumbsUp.toFixed(2)}
                              {"%"}
                            </Text>
                          </View>
                        </View>

                        {/* Price */}
                        <Text style={tabContentStyles.priceLabel}>
                          <Text style={tabContentStyles.priceRp}>Rp </Text>
                          <Text style={tabContentStyles.priceValue}>{listing.priceNum.toLocaleString("id-ID")}</Text>
                          <Text style={tabContentStyles.priceUnit}> /{listing.asset}</Text>
                        </Text>

                        {/* Limit */}
                        <Text style={tabContentStyles.limitText}>
                          {"Limit  "}
                          {formatRp(listing.limitMin)}
                          {" – "}
                          {formatRp(listing.limitMax)}
                          {" IDR"}
                        </Text>

                        {/* Tersedia */}
                        <Text style={tabContentStyles.tersediaText}>
                          {"Tersedia  "}
                          {listing.tersedia.toLocaleString("id-ID")}
                          {" "}
                          {listing.tersediaAsset}
                        </Text>

                        {/* Verified badge */}
                        {listing.verified && (
                          <View style={tabContentStyles.verifikasiBadge}>
                            <Ionicons name="shield-checkmark" size={11} color="#3B82F6" />
                            <Text style={tabContentStyles.verifikasiText}>Verifikasi</Text>
                          </View>
                        )}
                      </View>

                      {/* Right column */}
                      <View style={tabContentStyles.p2pRight}>
                        <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                          {listing.payments.slice(0, 4).map((pm, pi) => {
                            const isFiltered = filterPembayaran.length > 0 &&
                              filterPembayaran.some((fp) => pm.toLowerCase().includes(fp.toLowerCase()));
                            return (
                              <View key={pi} style={tabContentStyles.paymentMethodRow}>
                                <Text style={[tabContentStyles.paymentMethodText, isFiltered && { color: NEO_ACCENT, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>{pm}</Text>
                                <View style={[tabContentStyles.payDot, { backgroundColor: isFiltered ? NEO_ACCENT : "#F59E0B" }]} />
                              </View>
                            );
                          })}
                          {listing.payments.length > 4 && (
                            <Text style={[tabContentStyles.paymentMethodText, { color: NEO_ACCENT }]}>+{listing.payments.length - 4} lagi</Text>
                          )}
                          <View style={tabContentStyles.timeLimitRow}>
                            <Ionicons name="time-outline" size={11} color={NEO_MUTED} />
                            <Text style={tabContentStyles.timeLimitText}>{listing.timeLimit} menit</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[tabContentStyles.p2pBtn2, { backgroundColor: btnColor }]}
                          onPress={() => router.push({ pathname: "/p2p-order", params: { id: listing.id } })}
                          activeOpacity={0.88}
                        >
                          <Text style={tabContentStyles.p2pBtnText2}>{btnLabel}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
              {filtered.length === 0 && (
                <View style={tabContentStyles.emptyState}>
                  <Ionicons name="megaphone-outline" size={36} color={NEO_MUTED} />
                  <Text style={tabContentStyles.emptyStateText}>Belum ada iklan aktif</Text>
                  <Text style={[tabContentStyles.emptyStateText, { fontSize: 12, marginTop: 4 }]}>
                    Admin perlu membuat iklan terlebih dahulu di tab Iklan
                  </Text>
                </View>
              )}
            </View>

            {/* ── Modal: Jumlah ── */}
            <Modal visible={showJumlahSheet} transparent animationType="slide">
              <View style={tabContentStyles.sheetOverlay}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowJumlahSheet(false)} activeOpacity={1} />
                <View style={tabContentStyles.jumlahSheet}>
                  <View style={tabContentStyles.sheetHandle} />
                  <Text style={tabContentStyles.jumlahSheetTitle}>
                    {tradeSide === "beli" ? "Saya Ingin Membeli" : "Saya Ingin Menjual"}
                  </Text>
                  <View style={[tabContentStyles.jumlahInputWrap, neoInset]}>
                    <TextInput
                      style={tabContentStyles.jumlahInput}
                      placeholder="Masukkan jumlah total"
                      placeholderTextColor={NEO_MUTED}
                      keyboardType="numeric"
                      value={filterJumlahIdr}
                      onChangeText={(t) => setFilterJumlahIdr(t.replace(/\D/g, ""))}
                    />
                    <Text style={tabContentStyles.jumlahInputSuffix}>IDR</Text>
                  </View>
                  <View style={tabContentStyles.jumlahQuickRow}>
                    {JUMLAH_QUICK.map((q) => (
                      <TouchableOpacity
                        key={q.label}
                        style={[tabContentStyles.jumlahQuickChip, neoRaisedMd, filterJumlahIdr === q.value && { borderColor: NEO_ACCENT, borderWidth: 1.5 }]}
                        onPress={() => setFilterJumlahIdr(q.value)}
                        activeOpacity={0.85}
                      >
                        <Text style={[tabContentStyles.jumlahQuickText, filterJumlahIdr === q.value && { color: NEO_ACCENT }]}>{q.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={tabContentStyles.jumlahBtnRow}>
                    <TouchableOpacity
                      style={[tabContentStyles.jumlahResetBtn, neoRaisedMd]}
                      onPress={() => { setFilterJumlahIdr(""); }}
                      activeOpacity={0.85}
                    >
                      <Text style={tabContentStyles.jumlahResetText}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[tabContentStyles.jumlahConfirmBtn, neoAccentBtn]}
                      onPress={() => setShowJumlahSheet(false)}
                      activeOpacity={0.88}
                    >
                      <Text style={tabContentStyles.jumlahConfirmText}>Konfirmasi</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* ── Modal: Bayar dengan ── */}
            <Modal visible={showPembayaranSheet} transparent animationType="slide">
              <View style={tabContentStyles.sheetOverlay}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPembayaranSheet(false)} activeOpacity={1} />
                <View style={tabContentStyles.pembayaranSheet}>
                  <View style={tabContentStyles.sheetHandle} />
                  {/* Title */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <Text style={tabContentStyles.jumlahSheetTitle}>Bayar dengan</Text>
                    <Ionicons name="information-circle-outline" size={18} color={NEO_MUTED} />
                  </View>
                  {/* Search */}
                  <View style={[tabContentStyles.pembayaranSearchBar, neoInset]}>
                    <Ionicons name="search-outline" size={16} color={NEO_MUTED} />
                    <TextInput
                      style={tabContentStyles.pembayaranSearchInput}
                      placeholder="Cari"
                      placeholderTextColor={NEO_MUTED}
                      value={pembayaranSearch}
                      onChangeText={setPembayaranSearch}
                      returnKeyType="search"
                    />
                    {pembayaranSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setPembayaranSearch("")}>
                        <Ionicons name="close-circle" size={16} color={NEO_MUTED} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Payment method grid */}
                  <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                    <View style={tabContentStyles.paymentGrid}>
                      {filteredPaymentMethods.map((pm) => {
                        const isSemua = pm.name === "Semua";
                        const isSelected = isSemua
                          ? filterPembayaran.length === 0
                          : filterPembayaran.includes(pm.name);
                        return (
                          <TouchableOpacity
                            key={pm.name}
                            style={[
                              tabContentStyles.paymentGridItem,
                              neoRaisedMd,
                              isSelected && tabContentStyles.paymentGridItemActive,
                            ]}
                            onPress={() => togglePembayaran(pm.name)}
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                tabContentStyles.paymentGridText,
                                isSelected && tabContentStyles.paymentGridTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {pm.name}
                            </Text>
                            {pm.popular && !isSelected && (
                              <View style={tabContentStyles.popularDot} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                  {/* Buttons */}
                  <View style={[tabContentStyles.jumlahBtnRow, { marginTop: 14 }]}>
                    <TouchableOpacity
                      style={[tabContentStyles.jumlahResetBtn, neoRaisedMd]}
                      onPress={() => { setFilterPembayaran([]); setPembayaranSearch(""); }}
                      activeOpacity={0.85}
                    >
                      <Text style={tabContentStyles.jumlahResetText}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[tabContentStyles.jumlahConfirmBtn, neoAccentBtn]}
                      onPress={() => setShowPembayaranSheet(false)}
                      activeOpacity={0.88}
                    >
                      <Text style={tabContentStyles.jumlahConfirmText}>Konfirmasi</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </>
        )}

        {/* ── IKLAN SAYA TAB ── */}
        {subTab === "iklan" && (
          <>
            <TouchableOpacity
              style={[tabContentStyles.buatIklanBtn, neoRaisedMd]}
              onPress={() => router.push("/p2p-buat-iklan")}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={20} color={NEO_ACCENT} />
              <Text style={tabContentStyles.buatIklanText}>Buat Iklan Baru</Text>
              <Ionicons name="chevron-forward" size={16} color={NEO_MUTED} />
            </TouchableOpacity>

            <Text style={[tabContentStyles.p2pLabel, { marginBottom: 12, marginTop: 8 }]}>IKLAN AKTIF ({myListings.length})</Text>
            <View style={tabContentStyles.cardList}>
              {myListings.length === 0 && (
                <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 24 }}>
                  Belum ada iklan. Buat iklan pertamamu!
                </Text>
              )}
              {myListings.map((l) => (
                <View key={l.id} style={[tabContentStyles.myListingCard, neoRaisedMd]}>
                  <View style={tabContentStyles.myListingTop}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[tabContentStyles.typeBadge, { backgroundColor: l.type === "jual" ? "#EF444422" : "#22C55E22" }]}>
                        <Text style={[tabContentStyles.typeBadgeText, { color: l.type === "jual" ? "#EF4444" : "#22C55E" }]}>{l.type.toUpperCase()}</Text>
                      </View>
                      <Text style={tabContentStyles.myListingAsset}>{l.asset}</Text>
                    </View>
                    <View style={tabContentStyles.statusRow}>
                      <View style={[tabContentStyles.statusDot, { backgroundColor: l.status === "aktif" ? "#22C55E" : NEO_MUTED }]} />
                      <TouchableOpacity onPress={() => toggleStatus(l.id)}>
                        <Text style={[tabContentStyles.statusText, { color: l.status === "aktif" ? "#22C55E" : NEO_MUTED }]}>
                          {l.status === "aktif" ? "Aktif" : "Nonaktif"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={tabContentStyles.myListingDetails}>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Harga</Text>
                      <Text style={[tabContentStyles.p2pValue, { color: NEO_ACCENT }]}>{l.price}</Text>
                    </View>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Limit</Text>
                      <Text style={tabContentStyles.p2pValue}>
                        Rp {(l.limitMin / 1000).toFixed(0)}K–{l.limitMax >= 1_000_000 ? (l.limitMax / 1_000_000).toFixed(0) + "Jt" : (l.limitMax / 1000).toFixed(0) + "K"}
                      </Text>
                    </View>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Order</Text>
                      <Text style={tabContentStyles.p2pValue}>{l.orders} selesai</Text>
                    </View>
                  </View>
                  <View style={tabContentStyles.myListingFooter}>
                    <Text style={tabContentStyles.paymentTag}>{l.payment}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity style={tabContentStyles.myListingAction}>
                        <Ionicons name="create-outline" size={16} color={NEO_ACCENT} />
                        <Text style={tabContentStyles.myListingActionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[tabContentStyles.myListingAction, { backgroundColor: "#EF444411" }]}
                        onPress={() => deleteListing(l.id)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        <Text style={[tabContentStyles.myListingActionText, { color: "#EF4444" }]}>Hapus</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── ORDER TAB (my orders + incoming) ── */}
        {subTab === "order" && (
          <>
            {/* My placed orders */}
            <Text style={tabContentStyles.orderSectionTitle}>ORDER SAYA ({myPlacedOrders.length})</Text>
            <View style={tabContentStyles.cardList}>
              {myPlacedOrders.length === 0 && (
                <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 16 }}>
                  Belum ada order yang kamu buat.
                </Text>
              )}
              {myPlacedOrders.map((ord) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[tabContentStyles.orderCard, neoRaisedMd]}
                  onPress={() => router.push({ pathname: "/p2p-chat", params: { orderId: ord.id } })}
                  activeOpacity={0.85}
                >
                  <View style={tabContentStyles.orderTop}>
                    <View style={tabContentStyles.traderRow}>
                      <View style={[tabContentStyles.traderAvatar, { backgroundColor: orderStatusColor(ord.status) + "22" }]}>
                        <Text style={[tabContentStyles.traderAvatarText, { color: orderStatusColor(ord.status) }]}>{ord.traderName[0]}</Text>
                      </View>
                      <View>
                        <Text style={tabContentStyles.traderName}>{ord.traderName}</Text>
                        <Text style={tabContentStyles.traderStat}>{timeAgo(ord.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={[tabContentStyles.statusBadge, { backgroundColor: orderStatusColor(ord.status) + "22" }]}>
                      <Text style={[tabContentStyles.statusBadgeText, { color: orderStatusColor(ord.status) }]}>
                        {orderStatusLabel(ord.status)}
                      </Text>
                    </View>
                  </View>
                  <View style={tabContentStyles.orderDetails}>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Aset</Text>
                      <Text style={tabContentStyles.p2pValue}>{ord.assetAmount} {ord.asset}</Text>
                    </View>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Total IDR</Text>
                      <Text style={[tabContentStyles.p2pValue, { color: NEO_ACCENT }]}>Rp {ord.idrAmount.toLocaleString("id-ID")}</Text>
                    </View>
                    <View style={tabContentStyles.chatArrow}>
                      <Ionicons name="chatbubbles-outline" size={18} color={NEO_ACCENT} />
                      <Text style={tabContentStyles.chatArrowText}>Chat</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Incoming orders */}
            <Text style={[tabContentStyles.orderSectionTitle, { marginTop: 20 }]}>ORDER MASUK ({incomingOrders.length})</Text>
            <View style={tabContentStyles.cardList}>
              {incomingOrders.length === 0 && (
                <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 16 }}>
                  Belum ada order yang masuk ke iklanmu.
                </Text>
              )}
              {incomingOrders.map((ord) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[tabContentStyles.orderCard, neoRaisedMd]}
                  onPress={() => router.push({ pathname: "/p2p-chat", params: { orderId: ord.id } })}
                  activeOpacity={0.85}
                >
                  <View style={tabContentStyles.orderTop}>
                    <View style={tabContentStyles.traderRow}>
                      <View style={[tabContentStyles.traderAvatar, { backgroundColor: orderStatusColor(ord.status) + "22" }]}>
                        <Text style={[tabContentStyles.traderAvatarText, { color: orderStatusColor(ord.status) }]}>{ord.traderName[0]}</Text>
                      </View>
                      <View>
                        <Text style={tabContentStyles.traderName}>{ord.traderName}</Text>
                        <Text style={tabContentStyles.traderStat}>{timeAgo(ord.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={[tabContentStyles.statusBadge, { backgroundColor: orderStatusColor(ord.status) + "22" }]}>
                      <Text style={[tabContentStyles.statusBadgeText, { color: orderStatusColor(ord.status) }]}>
                        {orderStatusLabel(ord.status)}
                      </Text>
                    </View>
                  </View>
                  <View style={tabContentStyles.orderDetails}>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Aset</Text>
                      <Text style={tabContentStyles.p2pValue}>{ord.assetAmount} {ord.asset}</Text>
                    </View>
                    <View>
                      <Text style={tabContentStyles.p2pLabel}>Total IDR</Text>
                      <Text style={[tabContentStyles.p2pValue, { color: NEO_ACCENT }]}>Rp {ord.idrAmount.toLocaleString("id-ID")}</Text>
                    </View>
                    <View style={tabContentStyles.chatArrow}>
                      <Ionicons name="chatbubbles-outline" size={18} color={NEO_ACCENT} />
                      <Text style={tabContentStyles.chatArrowText}>Chat</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── OBROLAN TAB ── */}
        {subTab === "obrolan" && (
          <>
            <Text style={tabContentStyles.orderSectionTitle}>PERCAKAPAN AKTIF ({activeChats.length})</Text>
            <View style={tabContentStyles.cardList}>
              {activeChats.length === 0 && (
                <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 16 }}>
                  Belum ada percakapan aktif.
                </Text>
              )}
              {activeChats.map((chat) => {
                const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
                return (
                  <TouchableOpacity
                    key={chat.id}
                    style={[tabContentStyles.chatListCard, neoRaisedMd]}
                    onPress={() => router.push({ pathname: "/p2p-chat", params: { orderId: chat.id } })}
                    activeOpacity={0.85}
                  >
                    <View style={[tabContentStyles.traderAvatar, { backgroundColor: orderStatusColor(chat.status) + "22", width: 44, height: 44, borderRadius: 22 }]}>
                      <Text style={[tabContentStyles.traderAvatarText, { color: orderStatusColor(chat.status), fontSize: 18 }]}>{chat.traderName[0]}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={tabContentStyles.traderName}>{chat.traderName}</Text>
                        <Text style={tabContentStyles.chatTime}>{timeAgo(chat.createdAt)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={tabContentStyles.chatLastMsg} numberOfLines={1}>
                          {lastMsg ? lastMsg.text : "Belum ada pesan"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[tabContentStyles.paymentTag, { fontSize: 10 }]}>{chat.asset}</Text>
                        <View style={[tabContentStyles.statusBadge, { backgroundColor: orderStatusColor(chat.status) + "22", paddingHorizontal: 7, paddingVertical: 2 }]}>
                          <Text style={[tabContentStyles.statusBadgeText, { color: orderStatusColor(chat.status), fontSize: 10 }]}>
                            {orderStatusLabel(chat.status)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── PROFIL P2P TAB ── */}
        {subTab === "profil" && (
          <>
            {/* ── Notifikasi Order Masuk (hanya untuk pemilik iklan) ── */}
            {myListings.length > 0 && incomingOrders.filter(o => o.status === "menunggu").length > 0 && (
              <View style={tabContentStyles.notifSection}>
                <View style={tabContentStyles.notifHeader}>
                  <View style={tabContentStyles.notifBellWrap}>
                    <Ionicons name="notifications" size={16} color="#fff" />
                  </View>
                  <Text style={tabContentStyles.notifHeaderText}>
                    Order Masuk
                  </Text>
                  <View style={tabContentStyles.notifCountBadge}>
                    <Text style={tabContentStyles.notifCountText}>
                      {incomingOrders.filter(o => o.status === "menunggu").length}
                    </Text>
                  </View>
                </View>

                {incomingOrders.filter(o => o.status === "menunggu").map((ord) => (
                  <View key={ord.id} style={[tabContentStyles.notifCard, neoRaisedMd]}>
                    {/* Left: avatar + info */}
                    <View style={tabContentStyles.notifCardLeft}>
                      <View style={[tabContentStyles.notifAvatar, { backgroundColor: "#22C55E22" }]}>
                        <Text style={[tabContentStyles.notifAvatarText, { color: "#22C55E" }]}>
                          {ord.traderName[0]}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={tabContentStyles.notifNameRow}>
                          <Text style={tabContentStyles.notifBuyerName}>{ord.traderName}</Text>
                          <Text style={tabContentStyles.notifTime}>{timeAgo(ord.createdAt)}</Text>
                        </View>
                        <View style={tabContentStyles.notifActionRow}>
                          <View style={[tabContentStyles.notifActionBadge, { backgroundColor: "#22C55E22" }]}>
                            <Text style={[tabContentStyles.notifActionText, { color: "#22C55E" }]}>BELI</Text>
                          </View>
                          <Text style={tabContentStyles.notifAmount}>{ord.assetAmount} {ord.asset}</Text>
                          <Text style={tabContentStyles.notifSep}>·</Text>
                          <Text style={tabContentStyles.notifIdr}>Rp {ord.idrAmount.toLocaleString("id-ID")}</Text>
                        </View>
                        <View style={tabContentStyles.notifPayRow}>
                          <Ionicons name="card-outline" size={12} color={NEO_MUTED} />
                          <Text style={tabContentStyles.notifPayText}>{ord.paymentMethod}</Text>
                        </View>
                      </View>
                    </View>
                    {/* Buttons */}
                    <View style={tabContentStyles.notifBtnCol}>
                      <TouchableOpacity
                        style={tabContentStyles.notifChatBtn}
                        onPress={() => router.push({ pathname: "/p2p-chat", params: { orderId: ord.id } })}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="chatbubble-ellipses" size={14} color="#fff" />
                        <Text style={tabContentStyles.notifChatBtnText}>Chat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tabContentStyles.notifIgnoreBtn} activeOpacity={0.85}>
                        <Text style={tabContentStyles.notifIgnoreBtnText}>Abaikan</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {/* Divider riwayat */}
                {incomingOrders.filter(o => o.status !== "menunggu").length > 0 && (
                  <>
                    <Text style={tabContentStyles.notifHistoryLabel}>RIWAYAT SELESAI</Text>
                    {incomingOrders.filter(o => o.status !== "menunggu").map((ord) => (
                      <TouchableOpacity
                        key={ord.id}
                        style={[tabContentStyles.notifHistCard, neoRaisedMd]}
                        onPress={() => router.push({ pathname: "/p2p-chat", params: { orderId: ord.id } })}
                        activeOpacity={0.85}
                      >
                        <View style={tabContentStyles.notifCardLeft}>
                          <View style={[tabContentStyles.notifAvatar, { backgroundColor: "#6B728022" }]}>
                            <Text style={[tabContentStyles.notifAvatarText, { color: NEO_MUTED }]}>{ord.traderName[0]}</Text>
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <View style={tabContentStyles.notifNameRow}>
                              <Text style={tabContentStyles.notifBuyerName}>{ord.traderName}</Text>
                              <Text style={tabContentStyles.notifTime}>{timeAgo(ord.createdAt)}</Text>
                            </View>
                            <Text style={tabContentStyles.notifAmount}>{ord.assetAmount} {ord.asset} · Rp {ord.idrAmount.toLocaleString("id-ID")}</Text>
                          </View>
                        </View>
                        <View style={[tabContentStyles.notifStatusPill, { backgroundColor: ord.status === "selesai" ? "#22C55E22" : "#F59E0B22" }]}>
                          <Text style={[tabContentStyles.notifStatusText, { color: ord.status === "selesai" ? "#22C55E" : "#F59E0B" }]}>
                            {ord.status === "selesai" ? "Selesai" : "Dibayar"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Profile — hanya tampil kalau ada iklan */}
            {myListings.length === 0 ? (
              <View style={[tabContentStyles.profCard, neoRaisedMd, { alignItems: "center", paddingVertical: 40, gap: 12 }]}>
                <Ionicons name="person-circle-outline" size={60} color={NEO_MUTED} />
                <Text style={[tabContentStyles.profName, { textAlign: "center" }]}>Belum Ada Profil P2P</Text>
                <Text style={[tabContentStyles.profHandle, { textAlign: "center", lineHeight: 20 }]}>
                  Buat iklan pertama di tab{"\n"}
                  <Text style={{ color: NEO_ACCENT, fontFamily: "Inter_600SemiBold" }}>Iklan → Buat Iklan</Text>
                  {"\n"}untuk mulai berdagang
                </Text>
              </View>
            ) : (() => {
              // Computed dari data real
              const completedSeller = realOrders.filter(o => o.myRole === "seller" && o.status === "selesai");
              const cancelledSeller = realOrders.filter(o => o.myRole === "seller" && o.status === "dibatalkan");
              const totalVolIdr = completedSeller.reduce((s, o) => s + o.idrAmount, 0);
              const volFmt = totalVolIdr >= 1_000_000
                ? `Rp ${(totalVolIdr / 1_000_000).toFixed(1)} Jt`
                : totalVolIdr > 0 ? `Rp ${totalVolIdr.toLocaleString("id-ID")}` : "Rp 0";
              const totalTrades = completedSeller.length + cancelledSeller.length;
              const winRate = totalTrades > 0
                ? (completedSeller.length / totalTrades * 100).toFixed(1) + "%"
                : "—";
              const joinDate = myListings.length > 0
                ? new Date(Math.min(...myListings.map(l => new Date(l.createdAt).getTime())))
                    .toLocaleDateString("id-ID", { month: "short", year: "numeric" })
                : "—";
              const uniquePayMethods = [...new Set(
                myListings.filter(l => l.status === "aktif").flatMap(l => l.payments.map(p => p.method))
              )];

              return (
                <>
                  {/* Profile card */}
                  <View style={[tabContentStyles.profCard, neoRaisedMd]}>
                    <View style={tabContentStyles.profAvatarWrap}>
                      <View style={tabContentStyles.profAvatar}>
                        <Text style={tabContentStyles.profAvatarText}>{walletName[0]?.toUpperCase() ?? "A"}</Text>
                      </View>
                      <View style={tabContentStyles.profVerifiedBadge}>
                        <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                      </View>
                    </View>
                    <Text style={tabContentStyles.profName}>{walletName}</Text>
                    <Text style={tabContentStyles.profHandle}>
                      @{walletName.replace(/\s+/g, "").toLowerCase()} · Sejak {joinDate}
                    </Text>
                    <View style={tabContentStyles.profBadgeRow}>
                      <View style={[tabContentStyles.profBadge, { backgroundColor: "#22C55E18" }]}>
                        <Ionicons name="storefront" size={13} color="#22C55E" />
                        <Text style={[tabContentStyles.profBadgeText, { color: "#22C55E" }]}>
                          {myListings.filter(l => l.status === "aktif").length} Iklan Aktif
                        </Text>
                      </View>
                      {completedSeller.length >= 10 && (
                        <View style={[tabContentStyles.profBadge, { backgroundColor: NEO_ACCENT + "18" }]}>
                          <Ionicons name="trophy" size={13} color={NEO_ACCENT} />
                          <Text style={[tabContentStyles.profBadgeText, { color: NEO_ACCENT }]}>Top Trader</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Stats grid dari data real */}
                  <View style={tabContentStyles.profStatsGrid}>
                    {[
                      { label: "Total Volume",  value: volFmt,                         icon: "trending-up" },
                      { label: "Order Selesai", value: String(completedSeller.length), icon: "checkmark-done" },
                      { label: "Win Rate",      value: winRate,                        icon: "stats-chart" },
                      { label: "Bergabung",     value: joinDate,                       icon: "calendar" },
                    ].map((stat) => (
                      <View key={stat.label} style={[tabContentStyles.profStatCard, neoRaisedMd]}>
                        <View style={tabContentStyles.profStatIconWrap}>
                          <Ionicons name={stat.icon as IoniconName} size={20} color={NEO_ACCENT} />
                        </View>
                        <Text style={tabContentStyles.profStatValue}>{stat.value}</Text>
                        <Text style={tabContentStyles.profStatLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Metode pembayaran dari iklan aktif */}
                  {uniquePayMethods.length > 0 && (
                    <View style={[tabContentStyles.profSection, neoRaisedMd]}>
                      <Text style={tabContentStyles.profSectionTitle}>METODE PEMBAYARAN</Text>
                      {uniquePayMethods.map((m) => (
                        <View key={m} style={tabContentStyles.profPayRow}>
                          <Ionicons name="card-outline" size={16} color={NEO_ACCENT} />
                          <Text style={tabContentStyles.profPayText}>{m}</Text>
                          <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              );
            })()}

            {/* Admin panel entry */}
            <View style={tabContentStyles.adminDivider}>
              <View style={tabContentStyles.adminDividerLine} />
              <Text style={tabContentStyles.adminDividerText}>AREA ADMIN</Text>
              <View style={tabContentStyles.adminDividerLine} />
            </View>
            <TouchableOpacity
              style={[tabContentStyles.adminEntryBtn, neoRaisedMd]}
              onPress={() => router.push("/admin-login")}
              activeOpacity={0.85}
            >
              <View style={tabContentStyles.adminEntryIcon}>
                <Ionicons name="shield-checkmark" size={22} color={NEO_ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={tabContentStyles.adminEntryTitle}>Panel Admin</Text>
                <Text style={tabContentStyles.adminEntrySub}>Kelola & balas chat pelanggan P2P</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={NEO_MUTED} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Swap token types ────────────────────────────────────────────────────────
interface SwapToken {
  assetId: string;
  symbol: string;
  name: string;
  tipe: "NATIVE" | "STABLECOIN" | "STABLECOIN_PEGGED" | "SAHAM";
  pegRate: number;
  price: number; // harga market (GRD per token)
}

const GRD_TOKEN: SwapToken = { assetId: "native-grd", symbol: "GRD", name: "Garuda Coin", tipe: "NATIVE", pegRate: 1, price: 1 };

const DEX_RED = "#8B0000";

// ─── Stablecoin Swap Form ─────────────────────────────────────────────────────
function StablecoinForm({ asset, walletAddress, grdBalance, assetBalance, onDone }: {
  asset: SwapToken;
  walletAddress: string;
  grdBalance: number;
  assetBalance: number;
  onDone: () => void;
}) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);

  const pegRate = asset.pegRate > 0 ? asset.pegRate : 0.001;
  const swapRate = 1 / pegRate; // 1 GRD = swapRate tokens
  const qty = parseFloat(amount) || 0;
  const estimatedOut = direction === "buy" ? qty * swapRate : qty * pegRate;

  const handleSwap = async () => {
    if (!walletAddress || qty <= 0) return;
    setPending(true);
    const CBDC_RESERVE = "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s";
    const TX_FEE = 1000;
    try {
      if (direction === "buy") {
        // GRD → stablecoin: kirim GRD ke CBDC reserve dulu (on-chain)
        const wallet = await loadWallet();
        if (!wallet) throw new Error("Wallet tidak ditemukan");
        const key = await deriveKey(wallet.mnemonic, 0);
        const qkey = await deriveQuantumKey(wallet.mnemonic, 0);
        const amountSat = Math.round(qty * 1e8);
        const needed = amountSat + TX_FEE;
        // Try quantum UTXOs first, fall back to classical
        const qUtxos = await getUTXOs(qkey.address).catch(() => []);
        const utxos = await getUTXOs(walletAddress);
        if (!utxos.length && !qUtxos.length) throw new Error("Tidak ada UTXO tersedia");
        // Select UTXOs — prefer quantum if sufficient
        let collected = 0;
        const selUtxos: typeof utxos = [];
        const useQuantum = qUtxos.length > 0;
        const sourceUtxos = useQuantum ? qUtxos : utxos;
        for (const u of sourceUtxos) {
          selUtxos.push(u);
          collected += Math.round(u.amount * 1e8);
          if (collected >= needed) break;
        }
        // Fall back to classical if quantum UTXOs insufficient
        if (collected < needed && useQuantum) {
          selUtxos.length = 0; collected = 0;
          for (const u of utxos) {
            selUtxos.push(u); collected += Math.round(u.amount * 1e8);
            if (collected >= needed) break;
          }
        }
        if (collected < needed) throw new Error("Saldo GRD tidak cukup");
        const outs: { address: string; value: number }[] = [{ address: CBDC_RESERVE, value: amountSat }];
        const chg = collected - needed;
        const changeAddr = useQuantum && collected >= needed ? qkey.address : walletAddress;
        if (chg > 546) outs.push({ address: changeAddr, value: chg });
        const utxosForSign = selUtxos.map(u => ({ txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8) }));
        const hex = useQuantum && selUtxos === sourceUtxos
          ? await buildAndSignQuantumTx(utxosForSign, outs, qkey.secretKey, qkey.publicKey)
          : await buildAndSignTx(utxosForSign, outs, key.privateKey, key.publicKey);
        await broadcastTx(hex);
      }
      // CBDC swap: buy (GRD→stablecoin) atau sell (stablecoin→GRD)
      const res = await dexSwap({
        direction,
        asset_id: asset.assetId,
        amount: direction === "buy" ? qty : Math.floor(qty),
        address: walletAddress,
        price: pegRate,
      });
      if ((res as { error?: string }).error) throw new Error((res as { error?: string }).error);
      Alert.alert(
        "Swap Berhasil",
        direction === "buy"
          ? `${qty} GRD → ${estimatedOut.toFixed(0)} ${asset.symbol}`
          : `${qty} ${asset.symbol} → ${estimatedOut.toFixed(8)} GRD`
      );
      setAmount("");
      onDone();
    } catch (e: unknown) {
      Alert.alert("Swap Gagal", e instanceof Error ? e.message : "Gagal");
    } finally { setPending(false); }
  };

  return (
    <View style={dexStyles.card}>
      <View style={dexStyles.cardHeader}>
        <Text style={dexStyles.cardHeaderText}>💱 Swap Stablecoin</Text>
      </View>

      {/* Beli / Jual toggle */}
      <View style={dexStyles.sideRow}>
        <TouchableOpacity
          style={[dexStyles.sideBtn, direction === "buy" && { backgroundColor: "#22C55E" }]}
          onPress={() => { setDirection("buy"); setAmount(""); }}
          activeOpacity={0.85}
        >
          <Text style={[dexStyles.sideBtnText, direction === "buy" && { color: "#fff" }]}>Beli {asset.symbol}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dexStyles.sideBtn, direction === "sell" && dexStyles.sideBtnSell]}
          onPress={() => { setDirection("sell"); setAmount(""); }}
          activeOpacity={0.85}
        >
          <Text style={[dexStyles.sideBtnText, direction === "sell" && { color: "#fff" }]}>Jual {asset.symbol}</Text>
        </TouchableOpacity>
      </View>

      {/* Info rate */}
      <View style={dexStyles.infoBox}>
        <View style={dexStyles.infoRow}>
          <Text style={dexStyles.infoLabel}>Rate</Text>
          <Text style={dexStyles.infoValue}>1 GRD = {swapRate.toLocaleString("id-ID")} {asset.symbol}</Text>
        </View>
        <View style={dexStyles.infoRow}>
          <Text style={dexStyles.infoLabel}>Saldo GRD</Text>
          <Text style={dexStyles.infoValueMono}>{walletAddress ? grdBalance.toFixed(4) : "—"}</Text>
        </View>
        <View style={dexStyles.infoRow}>
          <Text style={dexStyles.infoLabel}>Saldo {asset.symbol}</Text>
          <Text style={dexStyles.infoValueMono}>{walletAddress ? assetBalance.toLocaleString("id-ID") : "—"}</Text>
        </View>
      </View>

      {/* Amount input */}
      <Text style={dexStyles.inputLabel}>
        {direction === "buy" ? "Jumlah GRD" : `Jumlah ${asset.symbol}`}
      </Text>
      <View style={[dexStyles.inputRow, neoInset]}>
        <TextInput
          style={[dexStyles.input, { flex: 1, marginHorizontal: 0 }]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          placeholderTextColor={NEO_MUTED}
        />
        <Text style={dexStyles.inputUnit}>{direction === "buy" ? "GRD" : asset.symbol}</Text>
      </View>

      {/* Estimasi */}
      <View style={dexStyles.estimateBox}>
        <Text style={dexStyles.estimateLabel}>Anda akan menerima:</Text>
        <Text style={dexStyles.estimateValue}>
          {qty > 0
            ? direction === "buy"
              ? `${estimatedOut.toFixed(0)} ${asset.symbol}`
              : `${estimatedOut.toFixed(8)} GRD`
            : "—"}
        </Text>
      </View>

      {/* Button */}
      {walletAddress ? (
        <TouchableOpacity
          style={[dexStyles.execBtn, { marginHorizontal: 14, marginBottom: 14 }, (pending || qty <= 0) && { opacity: 0.5 }]}
          onPress={() => void handleSwap()}
          disabled={pending || qty <= 0}
          activeOpacity={0.85}
        >
          <Text style={dexStyles.execBtnText}>
            {pending ? "Memproses..."
              : direction === "buy" ? `Swap GRD → ${asset.symbol}`
              : `Swap ${asset.symbol} → GRD`}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={[dexStyles.execBtn, { marginHorizontal: 14, marginBottom: 14, opacity: 0.6 }]}>
          <Text style={dexStyles.execBtnText}>Wallet Belum Terhubung</Text>
        </View>
      )}
      <Text style={dexStyles.noteText}>Stablecoin swap via CBDC Reserve Pool · Rate tetap</Text>
    </View>
  );
}

// ─── Saham Order Form ─────────────────────────────────────────────────────────
function SahamForm({ asset, walletAddress, grdBalance, assetBalance, onDone }: {
  asset: SwapToken;
  walletAddress: string;
  grdBalance: number;
  assetBalance: number;
  onDone: () => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [pending, setPending] = useState(false);

  const basePrice = asset.price;
  const qty = parseFloat(amount) || 0;
  const price = orderType === "limit" ? (parseFloat(limitPrice) || basePrice) : basePrice;
  const orderSize = side === "buy" ? (price > 0 ? qty / price : 0) : qty;
  const orderValue = side === "buy" ? qty : qty * price;

  const handleOrder = async () => {
    if (!walletAddress || qty <= 0) return;
    if (orderType === "limit" && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      Alert.alert("Harga Diperlukan", "Masukkan harga limit"); return;
    }
    setPending(true);
    try {
      const res = await dexPlaceOrder({
        order_type: orderType,
        side,
        asset_id: asset.assetId,
        amount: Math.floor(qty),
        price,
        address: walletAddress,
      });
      if (res.error) { Alert.alert("Order Gagal", res.error); return; }
      Alert.alert(
        `${side === "buy" ? "Buy" : "Sell"} Order Berhasil`,
        res.txid ? `TX: ${res.txid.slice(0, 16)}...` : "Order masuk ke orderbook on-chain"
      );
      setAmount(""); setLimitPrice("");
      onDone();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Gagal");
    } finally { setPending(false); }
  };

  return (
    <View style={dexStyles.card}>
      {/* Market / Limit tabs */}
      <View style={dexStyles.orderTypeTabs}>
        {(["market", "limit"] as const).map((t) => (
          <TouchableOpacity key={t} style={[dexStyles.orderTypeTab, orderType === t && dexStyles.orderTypeTabActive]} onPress={() => setOrderType(t)} activeOpacity={0.7}>
            <Text style={[dexStyles.orderTypeTabText, orderType === t && dexStyles.orderTypeTabTextActive]}>
              {t === "market" ? "Market" : "Limit"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Buy / Sell toggle */}
      <View style={dexStyles.sideRow}>
        <TouchableOpacity
          style={[dexStyles.sideBtn, side === "buy" && dexStyles.sideBtnBuy]}
          onPress={() => { setSide("buy"); setAmount(""); }}
          activeOpacity={0.85}
        >
          <Text style={[dexStyles.sideBtnText, side === "buy" && { color: "#fff" }]}>Buy / Long</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dexStyles.sideBtn, side === "sell" && dexStyles.sideBtnSell]}
          onPress={() => { setSide("sell"); setAmount(""); }}
          activeOpacity={0.85}
        >
          <Text style={[dexStyles.sideBtnText, side === "sell" && { color: "#fff" }]}>Sell / Short</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={dexStyles.infoBox}>
        <View style={dexStyles.infoRow}>
          <Text style={dexStyles.infoLabel}>Available</Text>
          <Text style={dexStyles.infoValueMono}>
            {walletAddress
              ? side === "buy" ? `${grdBalance.toFixed(4)} GRD` : `${assetBalance.toFixed(4)} ${asset.symbol}`
              : "—"}
          </Text>
        </View>
        <View style={dexStyles.infoRow}>
          <Text style={dexStyles.infoLabel}>Harga Market</Text>
          <Text style={dexStyles.infoValueMono}>{basePrice > 0 ? `${basePrice.toFixed(8)} GRD` : "—"}</Text>
        </View>
      </View>

      {/* Limit Price */}
      {orderType === "limit" && (
        <>
          <Text style={dexStyles.inputLabel}>Harga Limit (GRD)</Text>
          <View style={[dexStyles.inputRow, neoInset]}>
            <TextInput
              style={[dexStyles.input, { flex: 1, marginHorizontal: 0 }]}
              value={limitPrice}
              onChangeText={setLimitPrice}
              placeholder={basePrice > 0 ? basePrice.toFixed(8) : "0.00000000"}
              keyboardType="decimal-pad"
              placeholderTextColor={NEO_MUTED}
            />
            <Text style={dexStyles.inputUnit}>GRD</Text>
          </View>
        </>
      )}

      {/* Amount */}
      <Text style={dexStyles.inputLabel}>
        {side === "buy" ? "Jumlah GRD" : `Jumlah ${asset.symbol}`}
      </Text>
      <View style={[dexStyles.inputRow, neoInset]}>
        <TextInput
          style={[dexStyles.input, { flex: 1, marginHorizontal: 0 }]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          placeholderTextColor={NEO_MUTED}
        />
        <Text style={dexStyles.inputUnit}>{side === "buy" ? "GRD" : asset.symbol}</Text>
      </View>

      {/* Quick pct buttons */}
      <View style={dexStyles.pctRow}>
        {[25, 50, 75, 100].map((p) => (
          <TouchableOpacity key={p} style={dexStyles.pctBtn} activeOpacity={0.7}
            onPress={() => {
              const bal = side === "buy" ? grdBalance : assetBalance;
              setAmount((bal * p / 100).toFixed(4));
            }}>
            <Text style={dexStyles.pctBtnText}>{p}%</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      {qty > 0 && (
        <View style={[dexStyles.infoBox, { marginTop: 8 }]}>
          <View style={dexStyles.infoRow}>
            <Text style={dexStyles.infoLabel}>Order Size</Text>
            <Text style={dexStyles.infoValueMono}>{orderSize.toFixed(4)} {asset.symbol}</Text>
          </View>
          <View style={dexStyles.infoRow}>
            <Text style={dexStyles.infoLabel}>Order Value</Text>
            <Text style={dexStyles.infoValueMono}>{orderValue.toFixed(4)} GRD</Text>
          </View>
        </View>
      )}

      {/* Button */}
      {walletAddress ? (
        <TouchableOpacity
          style={[
            dexStyles.execBtn,
            { marginHorizontal: 14, marginBottom: 14 },
            side === "buy" ? { backgroundColor: "#22C55E" } : { backgroundColor: "#CC0001" },
            (pending || qty <= 0) && { opacity: 0.5 },
          ]}
          onPress={() => void handleOrder()}
          disabled={pending || qty <= 0}
          activeOpacity={0.85}
        >
          <Text style={dexStyles.execBtnText}>
            {pending ? "Memproses..."
              : qty <= 0 ? "Masukkan Jumlah"
              : side === "buy" ? `BUY / LONG ${asset.symbol}`
              : `SELL / SHORT ${asset.symbol}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={[dexStyles.execBtn, { marginHorizontal: 14, marginBottom: 14, opacity: 0.6 }]}>
          <Text style={dexStyles.execBtnText}>Wallet Belum Terhubung</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main TabSwap ─────────────────────────────────────────────────────────────
function TabSwap({ walletAddress, balanceSatoshi, onRefreshBalance }: { walletAddress: string; balanceSatoshi: number; onRefreshBalance?: () => void }) {
  const [allTokens, setAllTokens] = useState<SwapToken[]>([]);
  const [payToken, setPayToken] = useState<SwapToken>(GRD_TOKEN);
  const [receiveToken, setReceiveToken] = useState<SwapToken | null>(null);
  const [payAmount, setPayAmount] = useState("1");
  const [rate, setRate] = useState(0); // GRD per 1 token
  const [rateLoading, setRateLoading] = useState(false);
  const [payBalance, setPayBalance] = useState(0);
  const [receiveBalance, setReceiveBalance] = useState(0);
  const [pickerFor, setPickerFor] = useState<"pay" | "receive" | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [myOrders, setMyOrders] = useState<DexOrder[]>([]);
  const [showOrders, setShowOrders] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tradeRefresh, setTradeRefresh] = useState(0);

  const grdBalance = satoshiToGRD(balanceSatoshi);

  // Load token list
  useEffect(() => {
    void (async () => {
      try {
        const sc: StablecoinEntry[] = await getStablecoinList().catch(() => []);
        const pegged: StablecoinEntry[] = await getPeggedStablecoinList().catch(() => []);
        const st: StockEntry[] = await getStockList().catch(() => []);
        const scTokens: SwapToken[] = sc.map((s) => ({ ...s, tipe: "STABLECOIN" as const, pegRate: 0, price: 0 }));
        const pegTokens: SwapToken[] = pegged.map((s) => ({ ...s, tipe: "STABLECOIN_PEGGED" as const, pegRate: 0, price: 0 }));
        const stTokens: SwapToken[] = st.map((s) => ({ ...s, tipe: "SAHAM" as const, pegRate: 0, price: 0 }));
        const list = [...scTokens, ...pegTokens, ...stTokens];
        setAllTokens(list);
        if (list.length > 0) setReceiveToken(list[0]);
      } catch { /* ignore */ }
    })();
  }, []);

  // Auto-fetch rate when pair changes
  useEffect(() => {
    if (!receiveToken) return;
    const nonGrd = payToken.tipe !== "NATIVE" ? payToken : receiveToken.tipe !== "NATIVE" ? receiveToken : null;
    if (!nonGrd) { setRate(1); return; }
    setRateLoading(true);
    void (async () => {
      try {
        let r = 0;
        if (nonGrd.tipe === "STABLECOIN" || nonGrd.tipe === "STABLECOIN_PEGGED") {
          // For pegged tokens (pIDR), strip 'p' prefix for oracle lookup
          const sym = nonGrd.tipe === "STABLECOIN_PEGGED" && nonGrd.symbol.startsWith("p")
            ? nonGrd.symbol.slice(1) : nonGrd.symbol;
          r = await getStablecoinPegRate(nonGrd.assetId, sym).catch(() => 0);
        } else {
          r = await getAssetPrice(nonGrd.assetId).catch(() => 0);
        }
        setRate(r);
      } catch { /* ignore */ }
      setRateLoading(false);
    })();
  }, [payToken.assetId, receiveToken?.assetId]);

  // Fetch balances from DEX wallet
  useEffect(() => {
    if (!walletAddress) {
      setPayBalance(grdBalance);
      setReceiveBalance(0);
      return;
    }
    void getDexWalletInfo(walletAddress).then((info) => {
      // Selalu pakai grdBalance dari blockchain (lebih akurat dari DEX)
      // pay balance
      if (payToken.tipe === "NATIVE") {
        setPayBalance(grdBalance);
      } else {
        let b = 0;
        for (let i = 0; i < info.assets.length; i++) {
          if (info.assets[i].asset_id === payToken.assetId) { b = info.assets[i].balance; break; }
        }
        setPayBalance(b);
      }
      // receive balance
      if (!receiveToken || receiveToken.tipe === "NATIVE") {
        setReceiveBalance(grdBalance);
      } else {
        let b = 0;
        for (let i = 0; i < info.assets.length; i++) {
          if (info.assets[i].asset_id === receiveToken.assetId) { b = info.assets[i].balance; break; }
        }
        setReceiveBalance(b);
      }
    }).catch(() => {
      setPayBalance(payToken.tipe === "NATIVE" ? grdBalance : 0);
      setReceiveBalance(0);
    });
  }, [walletAddress, payToken.assetId, receiveToken?.assetId, tradeRefresh, grdBalance]);

  // Poll my open orders
  useEffect(() => {
    if (!walletAddress || !showOrders) return;
    const fetch_ = () => getMyDexOrders(walletAddress).then(setMyOrders).catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 5000);
    return () => clearInterval(iv);
  }, [walletAddress, showOrders, tradeRefresh]);

  const qty = parseFloat(payAmount) || 0;

  // Compute estimated receive amount
  let receiveAmt = 0;
  if (rate > 0 && receiveToken) {
    if (payToken.tipe === "NATIVE" && receiveToken.tipe !== "NATIVE") {
      receiveAmt = qty / rate; // GRD → token: tokens = GRD / (GRD per token)
    } else if (payToken.tipe !== "NATIVE" && receiveToken.tipe === "NATIVE") {
      receiveAmt = qty * rate; // token → GRD: GRD = tokens * (GRD per token)
    } else {
      receiveAmt = qty; // GRD↔GRD fallback
    }
  }

  const nonGrdToken = payToken.tipe !== "NATIVE" ? payToken : receiveToken?.tipe !== "NATIVE" ? receiveToken : null;
  const rateText = nonGrdToken && rate > 0
    ? `1 GRD = ${(1 / rate).toLocaleString("id-ID", { maximumFractionDigits: 6 })} ${nonGrdToken.symbol}`
    : "—";

  const handleSwapDir = () => {
    if (!receiveToken) return;
    const tmp = payToken;
    setPayToken(receiveToken);
    setReceiveToken(tmp);
    setPayAmount("1");
  };

  const showMsg = (title: string, msg: string) => {
    if (Platform.OS === "web") { window.alert(`${title}\n\n${msg}`); return; }
    Alert.alert(title, msg);
  };

  const handleConfirm = async () => {
    if (!walletAddress || !receiveToken || qty <= 0 || rate <= 0) return;
    setPending(true);
    const CBDC_RESERVE = "grd1qhaclxgx8xhzxjmwg8meuwp7k2ut53t0equ002s";
    const TX_FEE = 1000; // satoshi
    try {
      if (payToken.tipe === "NATIVE" && receiveToken.tipe === "STABLECOIN") {
        // 1. Kirim GRD on-chain ke CBDC reserve (GRD berpindah tangan)
        const wallet = await loadWallet();
        if (!wallet) throw new Error("Wallet tidak ditemukan");
        const key = await deriveKey(wallet.mnemonic, 0);
        const qkey = await deriveQuantumKey(wallet.mnemonic, 0);
        const amountSat = Math.round(qty * 1e8);
        const needed = amountSat + TX_FEE;
        const qUtxos2 = await getUTXOs(qkey.address).catch(() => []);
        const utxos = await getUTXOs(walletAddress);
        if (!utxos.length && !qUtxos2.length) throw new Error("Tidak ada UTXO tersedia");
        let collected = 0;
        const selectedUtxos: typeof utxos = [];
        const useQ2 = qUtxos2.length > 0;
        const src2 = useQ2 ? qUtxos2 : utxos;
        for (const u of src2) {
          selectedUtxos.push(u); collected += Math.round(u.amount * 1e8);
          if (collected >= needed) break;
        }
        if (collected < needed && useQ2) {
          selectedUtxos.length = 0; collected = 0;
          for (const u of utxos) {
            selectedUtxos.push(u); collected += Math.round(u.amount * 1e8);
            if (collected >= needed) break;
          }
        }
        if (collected < needed) throw new Error("Saldo GRD tidak cukup");
        const outputs: { address: string; value: number }[] = [
          { address: CBDC_RESERVE, value: amountSat },
        ];
        const change = collected - needed;
        if (change > 546) outputs.push({ address: useQ2 ? qkey.address : walletAddress, value: change });
        const utxos2ForSign = selectedUtxos.map(u => ({ txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8) }));
        const rawHex = useQ2 && selectedUtxos.length === src2.length
          ? await buildAndSignQuantumTx(utxos2ForSign, outputs, qkey.secretKey, qkey.publicKey)
          : await buildAndSignTx(utxos2ForSign, outputs, key.privateKey, key.publicKey);
        await broadcastTx(rawHex);
        // 2. Transfer stablecoin dari reserve ke user
        await dexSwap({ direction: "buy", asset_id: receiveToken.assetId, amount: qty, address: walletAddress, price: rate });
      } else if (payToken.tipe === "NATIVE" && receiveToken.tipe === "SAHAM") {
        // GRD → SAHAM: kirim GRD ke CBDC reserve dulu (deduct), lalu place market buy
        const wallet = await loadWallet();
        if (!wallet) throw new Error("Wallet tidak ditemukan");
        const key = await deriveKey(wallet.mnemonic, 0);
        const qkey = await deriveQuantumKey(wallet.mnemonic, 0);
        const amountSat = Math.round(qty * rate * 1e8);
        const needed = amountSat + TX_FEE;
        const qUtxos3 = await getUTXOs(qkey.address).catch(() => []);
        const utxos = await getUTXOs(walletAddress);
        if (!utxos.length && !qUtxos3.length) throw new Error("Tidak ada UTXO tersedia");
        let collected = 0;
        const selectedUtxos: typeof utxos = [];
        const useQ3 = qUtxos3.length > 0;
        const src3 = useQ3 ? qUtxos3 : utxos;
        for (const u of src3) {
          selectedUtxos.push(u); collected += Math.round(u.amount * 1e8);
          if (collected >= needed) break;
        }
        if (collected < needed && useQ3) {
          selectedUtxos.length = 0; collected = 0;
          for (const u of utxos) {
            selectedUtxos.push(u); collected += Math.round(u.amount * 1e8);
            if (collected >= needed) break;
          }
        }
        if (collected < needed) throw new Error("Saldo GRD tidak cukup");
        const grdOutputs: { address: string; value: number }[] = [
          { address: CBDC_RESERVE, value: amountSat },
        ];
        const grdChange = collected - needed;
        if (grdChange > 546) grdOutputs.push({ address: useQ3 ? qkey.address : walletAddress, value: grdChange });
        const utxos3ForSign = selectedUtxos.map(u => ({ txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8) }));
        const grdHex = useQ3 && selectedUtxos.length === src3.length
          ? await buildAndSignQuantumTx(utxos3ForSign, grdOutputs, qkey.secretKey, qkey.publicKey)
          : await buildAndSignTx(utxos3ForSign, grdOutputs, key.privateKey, key.publicKey);
        await broadcastTx(grdHex);
        // Setelah GRD terkirim, place market buy order
        await dexPlaceOrder({ order_type: "market", side: "buy", asset_id: receiveToken.assetId, amount: qty, price: rate, address: walletAddress });
      } else if (payToken.tipe === "SAHAM" && receiveToken.tipe === "NATIVE") {
        // SAHAM → GRD: blockchain deduct saham via placemarketorder sell, API kirim GRD ke user
        await dexPlaceOrder({ order_type: "market", side: "sell", asset_id: payToken.assetId, amount: qty, price: rate, address: walletAddress });
      } else if (payToken.tipe === "STABLECOIN" && receiveToken.tipe === "NATIVE") {
        // gIDR → GRD: CBDC swap — kirim stablecoin ke reserve, dapat GRD
        const res = await dexSwap({ direction: "sell", asset_id: payToken.assetId, amount: qty, address: walletAddress, price: rate });
        if ((res as { error?: string }).error) throw new Error((res as { error?: string }).error);
      } else if (payToken.tipe === "STABLECOIN" && receiveToken.tipe === "SAHAM") {
        // gIDR → TLKM: 2-step via CBDC+orderbook (server-side)
        const res = await crossSwap({
          pay_type: "STABLECOIN",
          pay_asset_id: payToken.assetId,
          receive_type: "SAHAM",
          receive_asset_id: receiveToken.assetId,
          amount: qty,
          address: walletAddress,
        });
        if (res.error) throw new Error(res.error);
      } else if (payToken.tipe === "SAHAM" && receiveToken.tipe === "STABLECOIN") {
        // TLKM → gIDR: blockchain deduct TLKM via cross-swap (placemarketorder sell)
        const res = await crossSwap({
          pay_type: "SAHAM",
          pay_asset_id: payToken.assetId,
          receive_type: "STABLECOIN",
          receive_asset_id: receiveToken.assetId,
          amount: qty,
          address: walletAddress,
        });
        if (res.error) throw new Error(res.error);
      }
      setPayAmount("1");
      // Refresh balance
      setTradeRefresh((n: number) => n + 1);
      if (onRefreshBalance) onRefreshBalance();
      showMsg("Berhasil", "Swap berhasil! Saldo diperbarui.");
    } catch (e: unknown) {
      showMsg("Gagal", (e as Error)?.message ?? "Terjadi kesalahan");
    } finally {
      setPending(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!walletAddress) return;
    setCancellingId(orderId);
    try {
      const res = await cancelDexOrder(orderId, walletAddress);
      if (!res.error) {
        setMyOrders((prev) => prev.filter((o) => o.order_id !== orderId));
        setTradeRefresh((n) => n + 1);
      } else { Alert.alert("Gagal", res.error); }
    } catch { /* ignore */ }
    setCancellingId(null);
  };

  const toGrd = (p: number) => p > 1000 ? p / 1e8 : p;
  const canSwap = !pending && !!walletAddress && qty > 0 && rate > 0 && !!receiveToken;

  const allPickerTokens: SwapToken[] = [GRD_TOKEN, ...allTokens];
  const pickerTokens = allPickerTokens.filter((t) => {
    if (!pickerSearch) return true;
    const q = pickerSearch.toLowerCase();
    return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F5F5F7" }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, marginBottom: 18 }}>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_TEXT }}>Swap</Text>
        <Ionicons name={"swap-horizontal-outline" as IoniconName} size={20} color={NEO_MUTED} />
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {/* ── Pay Box ── */}
        <View style={dexStyles.swapBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={dexStyles.swapBoxLabel}>Pay</Text>
            <Text style={dexStyles.swapBoxBalance}>
              Saldo: {payBalance.toLocaleString("id-ID", { maximumFractionDigits: 4 })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", overflow: "hidden" }}>
            <TouchableOpacity
              style={dexStyles.tokenBtn}
              onPress={() => { setPickerFor("pay"); setPickerSearch(""); }}
              activeOpacity={0.8}
            >
              <AssetLogo symbol={payToken.symbol} tipe={payToken.tipe} size={28} />
              <Text style={dexStyles.tokenBtnText}>{payToken.symbol}</Text>
              <Ionicons name={"chevron-down" as IoniconName} size={16} color={NEO_MUTED} />
            </TouchableOpacity>
            <TextInput
              style={dexStyles.swapAmountInput}
              value={payAmount}
              onChangeText={(t) => {
                // Hanya angka dan titik desimal
                const clean = t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                setPayAmount(clean);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={NEO_MUTED}
            />
          </View>
        </View>

        {/* ── Swap direction button ── */}
        <View style={{ alignItems: "center", marginVertical: 6, zIndex: 10 }}>
          <TouchableOpacity style={dexStyles.swapDirBtn} onPress={handleSwapDir} activeOpacity={0.8}>
            <Ionicons name={"swap-vertical-outline" as IoniconName} size={20} color={DEX_RED} />
          </TouchableOpacity>
        </View>

        {/* ── Receive Box ── */}
        <View style={dexStyles.swapBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={dexStyles.swapBoxLabel}>Receive</Text>
            <Text style={dexStyles.swapBoxBalance}>
              Saldo: {receiveBalance.toLocaleString("id-ID", { maximumFractionDigits: 4 })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              style={dexStyles.tokenBtn}
              onPress={() => { setPickerFor("receive"); setPickerSearch(""); }}
              activeOpacity={0.8}
            >
              {receiveToken ? (
                <>
                  <AssetLogo symbol={receiveToken.symbol} tipe={receiveToken.tipe} size={28} />
                  <Text style={dexStyles.tokenBtnText}>{receiveToken.symbol}</Text>
                </>
              ) : (
                <Text style={[dexStyles.tokenBtnText, { color: NEO_MUTED }]}>Pilih</Text>
              )}
              <Ionicons name={"chevron-down" as IoniconName} size={16} color={NEO_MUTED} />
            </TouchableOpacity>
            <Text style={dexStyles.swapEstimateText}>
              {rateLoading ? "..." : receiveAmt > 0 ? receiveAmt.toLocaleString("id-ID", { maximumFractionDigits: 6 }) : "0"}
            </Text>
          </View>
        </View>

        {/* ── Rate info box ── */}
        <View style={[dexStyles.infoBox, { marginHorizontal: 0, marginTop: 12, marginBottom: 16 }]}>
          <View style={dexStyles.infoRow}>
            <Text style={dexStyles.infoLabel}>Exchange Rate</Text>
            <Text style={dexStyles.infoValue}>{rateLoading ? "Memuat..." : rateText}</Text>
          </View>
          <View style={dexStyles.infoRow}>
            <Text style={dexStyles.infoLabel}>Network Fee</Text>
            <Text style={dexStyles.infoValue}>0,00 GRD</Text>
          </View>
        </View>

        {/* ── Confirm Swap button ── */}
        <TouchableOpacity
          style={[dexStyles.execBtn, { marginHorizontal: 0 }, !canSwap && { opacity: 0.5 }]}
          onPress={() => void handleConfirm()}
          disabled={!canSwap}
          activeOpacity={0.8}
        >
          <Text style={dexStyles.execBtnText}>
            {pending ? "Memproses..." : walletAddress ? "Confirm Swap" : "Wallet Belum Terhubung"}
          </Text>
        </TouchableOpacity>

        <Text style={[dexStyles.noteText, { marginTop: 8 }]}>
          Token → Token dieksekusi otomatis routing via GRD. Order Book DEX.
        </Text>
      </View>

      {/* ── My open orders ── */}
      {walletAddress && (
        <View style={[dexStyles.ordersSection, { marginTop: 16, marginHorizontal: 16 }]}>
          <TouchableOpacity style={dexStyles.ordersHeader} onPress={() => setShowOrders((v) => !v)} activeOpacity={0.8}>
            <Text style={dexStyles.ordersHeaderText}>Order Terbuka</Text>
            {myOrders.length > 0 && (
              <View style={dexStyles.ordersBadge}><Text style={dexStyles.ordersBadgeText}>{myOrders.length}</Text></View>
            )}
            <Ionicons name={(showOrders ? "chevron-up" : "chevron-down") as IoniconName} size={14} color={NEO_MUTED} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
          {showOrders && (
            myOrders.length === 0
              ? <Text style={dexStyles.ordersEmpty}>Tidak ada order terbuka.</Text>
              : myOrders.map((o) => (
                <View key={o.order_id} style={dexStyles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[dexStyles.orderSide, { color: o.side === "buy" ? "#22C55E" : "#CC0001" }]}>
                      {o.side === "buy" ? "BUY" : "SELL"} {o.symbol ?? o.asset_id.slice(0, 8)}
                    </Text>
                    <Text style={dexStyles.orderDetail}>
                      {toGrd(o.price_grd).toFixed(6)} GRD · {o.remaining}/{o.quantity} lembar
                    </Text>
                  </View>
                  <TouchableOpacity style={dexStyles.cancelBtn} onPress={() => void handleCancel(o.order_id)} disabled={cancellingId === o.order_id}>
                    <Text style={dexStyles.cancelBtnText}>{cancellingId === o.order_id ? "..." : "Cancel"}</Text>
                  </TouchableOpacity>
                </View>
              ))
          )}
        </View>
      )}

      {/* ── Token picker modal ── */}
      <Modal visible={pickerFor !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerFor(null)}>
        <View style={dexStyles.pickerModal}>
          <View style={dexStyles.pickerHeader}>
            <Text style={dexStyles.pickerTitle}>Pilih {pickerFor === "pay" ? "Pay" : "Receive"} Token</Text>
            <TouchableOpacity onPress={() => { setPickerFor(null); setPickerSearch(""); }} activeOpacity={0.7}>
              <Ionicons name={"close" as IoniconName} size={22} color={NEO_TEXT} />
            </TouchableOpacity>
          </View>
          <View style={[dexStyles.pickerSearch, { marginHorizontal: 16, marginVertical: 10 }]}>
            <Ionicons name={"search-outline" as IoniconName} size={16} color={NEO_MUTED} />
            <TextInput style={dexStyles.pickerSearchInput} value={pickerSearch} onChangeText={setPickerSearch} placeholder="Cari token..." placeholderTextColor={NEO_MUTED} autoFocus />
          </View>
          <ScrollView>
            {pickerTokens.map((t) => (
              <TouchableOpacity
                key={t.assetId}
                style={dexStyles.pickerRow}
                activeOpacity={0.8}
                onPress={() => {
                  if (pickerFor === "pay") setPayToken(t);
                  else if (pickerFor === "receive") setReceiveToken(t);
                  setPickerFor(null);
                  setPickerSearch("");
                  setPayAmount("1");
                }}
              >
                <AssetLogo symbol={t.symbol} size={36} tipe={t.tipe} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={dexStyles.pickerRowSymbol}>{t.symbol}</Text>
                  <Text style={dexStyles.pickerRowName}>{t.name}</Text>
                </View>
                <View style={[
                  dexStyles.pairBadge,
                  t.tipe === "STABLECOIN" ? dexStyles.pairBadgeSwap :
                  t.tipe === "NATIVE" ? { backgroundColor: "#FEF3C7" } : dexStyles.pairBadgeOrder
                ]}>
                  <Text style={[dexStyles.pairBadgeText, {
                    color: t.tipe === "STABLECOIN" ? "#1D4ED8" : t.tipe === "NATIVE" ? "#92400E" : DEX_RED
                  }]}>
                    {t.tipe === "NATIVE" ? "GRD" : t.tipe === "STABLECOIN" ? "Stable" : "Saham"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function TabActivity({ txHistory, walletAddress }: { txHistory: TxItem[]; walletAddress: string }) {
  type ActivitySection = "transaksi" | "kurs" | "presale" | "dividen";
  const [section, setSection] = useState<ActivitySection>("transaksi");
  const [oracleRates, setOracleRates] = useState<OracleRate[]>([]);
  const [presales, setPresales] = useState<PresaleInfo[]>([]);
  const [dividends, setDividends] = useState<DividendInfo[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);

  useEffect(() => {
    setRatesLoading(true);
    getOracleRates().then(setOracleRates).finally(() => setRatesLoading(false));
    getPresales().then(setPresales).catch(() => {});
    const iv = setInterval(() => { getOracleRates().then(setOracleRates); }, 5000);
    return () => clearInterval(iv);
  }, []);

  const sections: { key: ActivitySection; label: string }[] = [
    { key: "transaksi", label: "Transaksi" },
    { key: "kurs", label: "Kurs Oracle" },
    { key: "presale", label: "Presale" },
    { key: "dividen", label: "Dividen" },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
      <Text style={tabContentStyles.pageTitle}>Aktivitas</Text>

      {/* Section Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {sections.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: section === s.key ? NEO_ACCENT : "#F1F1F1", marginRight: 8 }}
            onPress={() => setSection(s.key)}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: section === s.key ? "#FFF" : NEO_MUTED }}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Transaksi */}
      {section === "transaksi" && (
        txHistory.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
            <Ionicons name={"receipt-outline" as React.ComponentProps<typeof Ionicons>["name"]} size={44} color={NEO_MUTED} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED }}>Belum ada transaksi</Text>
          </View>
        ) : (
          <View style={[tabContentStyles.activityCard, neoRaisedMd]}>
            {txHistory.map((tx, i) => {
              const isSend = tx.from === walletAddress;
              const color = isSend ? "#EF4444" : "#22C55E";
              const icon = isSend ? "arrow-up-circle" : "arrow-down-circle";
              const label = isSend ? "Kirim GRD" : "Terima GRD";
              const amountStr = isSend ? `-${formatGRD(tx.value)} GRD` : `+${formatGRD(tx.value)} GRD`;
              const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
              return (
                <View key={tx.txid} style={[tabContentStyles.txRow, i < txHistory.length - 1 && tabContentStyles.txRowBorder]}>
                  <View style={[tabContentStyles.txIcon, { backgroundColor: color + "20" }]}>
                    <Ionicons name={icon as React.ComponentProps<typeof Ionicons>["name"]} size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={tabContentStyles.txTopRow}>
                      <Text style={tabContentStyles.txType}>{label}</Text>
                      <Text style={[tabContentStyles.txAmount, { color }]}>{amountStr}</Text>
                    </View>
                    <View style={tabContentStyles.txBottomRow}>
                      <Text style={tabContentStyles.txDate}>{dateStr}</Text>
                      <View style={[tabContentStyles.txBadge, { backgroundColor: "#22C55E22" }]}>
                        <Text style={[tabContentStyles.txBadgeText, { color: "#22C55E" }]}>Selesai</Text>
                      </View>
                    </View>
                    <Text style={tabContentStyles.txIDR}>Fee: {formatGRD(tx.fee)} GRD</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )
      )}

      {/* Kurs Oracle Real-Time */}
      {section === "kurs" && (
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED }}>
              {oracleRates.length} mata uang • Update per detik
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#22C55E" }}>Live</Text>
            </View>
          </View>
          {ratesLoading ? (
            <Text style={{ textAlign: "center", color: NEO_MUTED, paddingVertical: 24, fontFamily: "Inter_400Regular" }}>Memuat kurs...</Text>
          ) : (
            <View style={[neoRaisedMd, { backgroundColor: "#FFF", borderRadius: 14, overflow: "hidden" }]}>
              {/* Header */}
              <View style={{ flexDirection: "row", padding: 12, backgroundColor: "#F8F8F8", borderBottomWidth: 1, borderBottomColor: "#EEE" }}>
                <Text style={{ flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED }}>MATA UANG</Text>
                <Text style={{ width: 110, fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, textAlign: "right" }}>GRD/UNIT</Text>
                <Text style={{ width: 90, fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, textAlign: "right" }}>UNIT/GRD</Text>
              </View>
              {oracleRates.slice(0, 50).map((r, i) => (
                <View key={r.symbol} style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < 49 ? 1 : 0, borderBottomColor: "#F3F3F3", alignItems: "center" }}>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#C8922A22", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#C8922A" }}>{r.symbol.slice(0, 3)}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT }}>{r.symbol}</Text>
                  </View>
                  <Text style={{ width: 110, fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_TEXT, textAlign: "right" }}>{r.grd_per_unit.toFixed(6)}</Text>
                  <Text style={{ width: 90, fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED, textAlign: "right" }}>{r.units_per_grd.toFixed(4)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Presale */}
      {section === "presale" && (
        <View>
          {presales.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
              <Ionicons name={"rocket-outline" as React.ComponentProps<typeof Ionicons>["name"]} size={44} color={NEO_MUTED} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED }}>Belum ada presale aktif</Text>
            </View>
          ) : (
            presales.map((p) => {
              const progress = p.hard_cap > 0 ? Math.min(100, (p.raised / p.hard_cap) * 100) : 0;
              const isActive = p.status === "ACTIVE" || p.status === "active";
              return (
                <View key={p.asset_id} style={[neoRaisedMd, { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 12 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366F122", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#6366F1" }}>{(p.symbol || "?").slice(0, 2)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT }}>{p.name || p.symbol}</Text>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED }}>{p.symbol}</Text>
                      </View>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: isActive ? "#22C55E22" : "#EF444422" }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isActive ? "#22C55E" : "#EF4444" }}>{isActive ? "Aktif" : "Selesai"}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED }}>Harga: {p.price_grd} GRD</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED }}>{p.raised?.toFixed(2) ?? 0} / {p.hard_cap} GRD</Text>
                  </View>
                  {/* Progress Bar */}
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: "#F1F1F1", marginBottom: 6 }}>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: "#6366F1", width: `${progress}%` as any }} />
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "right" }}>{progress.toFixed(1)}% terkumpul</Text>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Dividen */}
      {section === "dividen" && (
        <View>
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
            <Ionicons name={"cash-outline" as React.ComponentProps<typeof Ionicons>["name"]} size={44} color={NEO_MUTED} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED }}>Dividen akan muncul di sini</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", paddingHorizontal: 24 }}>
              Ketika saham yang Anda miliki membagikan dividen, riwayat distribusi akan tampil di halaman ini.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const WEBSITE_URL =
  Platform.OS === "web"
    ? "http://localhost:5173"
    : "http://192.168.20.155:5173";

function TabCari({ walletAddress }: { walletAddress: string }) {
  const [url, setUrl] = useState(WEBSITE_URL);
  const [inputUrl, setInputUrl] = useState(WEBSITE_URL);
  const [key, setKey] = useState(0);

  const navigate = (target: string) => {
    let u = target.trim();
    if (u && !u.startsWith("http")) u = `http://${u}`;
    if (!u) return;
    setUrl(u);
    setInputUrl(u);
    setKey((k) => k + 1);
  };

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F7" }}>
        {/* URL bar */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}>
            <Ionicons name={"globe-outline" as IoniconName} size={14} color={NEO_MUTED} />
            <TextInput
              style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT }}
              value={inputUrl}
              onChangeText={setInputUrl}
              onSubmitEditing={() => navigate(inputUrl)}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity
            style={{ backgroundColor: NEO_ACCENT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            onPress={() => navigate(inputUrl)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" }}>Go</Text>
          </TouchableOpacity>
        </View>
        {/* Shortcut buttons */}
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" }}>
          {[
            { label: "Explorer", path: "/" },
            { label: "DEX", path: "/dex" },
            { label: "Wallet", path: `/address/${walletAddress}` },
          ].map((s) => (
            <TouchableOpacity
              key={s.label}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }}
              onPress={() => navigate(`${WEBSITE_URL}${s.path}`)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_TEXT }}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* iframe */}
        <View style={{ flex: 1 }}>
          {/* @ts-ignore */}
          <iframe
            key={key}
            src={url}
            style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
            title="GarudaChain"
          />
        </View>
      </View>
    );
  }

  // Native: tampilkan link untuk buka browser
  return (
    <View style={{ flex: 1, backgroundColor: "#F5F5F7", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Ionicons name={"globe-outline" as IoniconName} size={48} color={NEO_MUTED} />
      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginTop: 16, textAlign: "center" }}>GarudaChain Explorer</Text>
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 8, textAlign: "center" }}>{WEBSITE_URL}</Text>
    </View>
  );
}

function LeftDrawer({
  visible,
  wallets,
  activeWallet,
  onSelectWallet,
  onAddAccount,
  onManageAccounts,
  onSettings,
  onClose,
  topPad,
  bottomPad,
}: {
  visible: boolean;
  wallets: WalletItem[];
  activeWallet: string;
  onSelectWallet: (id: string) => void;
  onAddAccount: () => void;
  onManageAccounts: () => void;
  onSettings: () => void;
  onClose: () => void;
  topPad: number;
  bottomPad: number;
}) {
  const slideAnim = useRef(new Animated.Value(-280)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, damping: 24, stiffness: 220 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -280, duration: 200, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "rgba(0,0,0,0.45)",
                opacity: backdropAnim,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            sidebarStyles.drawer,
            { paddingTop: topPad, paddingBottom: bottomPad + 8, transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={sidebarStyles.drawerHeader}>
            <TouchableOpacity onPress={onClose} style={sidebarStyles.drawerBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
            </TouchableOpacity>
            <Text style={sidebarStyles.drawerTitle}>Dompet Saya</Text>
          </View>

          {/* Wallet List */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {wallets.map((wallet) => {
              const isActive = activeWallet === wallet.id;
              return (
                <TouchableOpacity
                  key={wallet.id}
                  style={[sidebarStyles.drawerRow, isActive && sidebarStyles.drawerRowActive]}
                  activeOpacity={0.7}
                  onPress={() => { onSelectWallet(wallet.id); onClose(); }}
                >
                  <View style={[sidebarStyles.drawerCircle, { backgroundColor: wallet.color + "22", borderColor: wallet.color, borderWidth: isActive ? 2.5 : 0 }]}>
                    <Text style={[sidebarStyles.drawerCircleText, { color: wallet.color }]}>{wallet.initial}</Text>
                  </View>
                  <Text style={[sidebarStyles.drawerWalletName, isActive && { color: NEO_TEXT, fontFamily: "Inter_700Bold" }]}>
                    {wallet.label}
                  </Text>
                  {isActive && (
                    <Ionicons name={"checkmark-circle" as IoniconName} size={20} color={wallet.color} style={{ marginLeft: "auto" }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom Buttons */}
          <View style={sidebarStyles.drawerBottom}>
            <TouchableOpacity style={sidebarStyles.drawerBottomBtn} activeOpacity={0.7} onPress={() => { onClose(); onAddAccount(); }}>
              <Ionicons name={"add" as IoniconName} size={22} color={NEO_MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={sidebarStyles.drawerBottomBtn} activeOpacity={0.7} onPress={() => { onClose(); onManageAccounts(); }}>
              <Ionicons name={"pencil-outline" as IoniconName} size={20} color={NEO_MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={sidebarStyles.drawerBottomBtn} activeOpacity={0.7} onPress={() => { onClose(); onSettings(); }}>
              <Ionicons name={"settings-outline" as IoniconName} size={20} color={NEO_MUTED} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function BerandaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("home");
  const [assetSubTab, setAssetSubTab] = useState<"kripto" | "stablecoin" | "saham">("kripto");
  const [showPanel, setShowPanel] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showManageAccounts, setShowManageAccounts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNetworks, setShowNetworks] = useState(false);
  const [showConnectedApps, setShowConnectedApps] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [activeWallet, setActiveWallet] = useState("account-0");
  const [walletItems, setWalletItems] = useState<WalletItem[]>([]);

  // GarudaChain wallet state
  const [walletAddress, setWalletAddress] = useState("");
  const [quantumAddress, setQuantumAddress] = useState("");
  const [walletName, setWalletName] = useState("Akun 1");
  const [balanceSatoshi, setBalanceSatoshi] = useState(0);
  const [txHistory, setTxHistory] = useState<TxItem[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Live on-chain assets
  const [liveStablecoins, setLiveStablecoins] = useState<StablecoinEntry[]>([]);
  const [liveStocks, setLiveStocks] = useState<StockEntry[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      setAssetsLoading(true);
      try {
        const sc: StablecoinEntry[] = await getStablecoinList();
        const st: StockEntry[] = await getStockList();
        setLiveStablecoins(sc);
        setLiveStocks(st);
      } catch { /* ignore */ }
      finally { setAssetsLoading(false); }
    })();
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const currentWallet = walletItems.find((w) => w.id === activeWallet) ?? walletItems[0] ?? { id: "", label: walletName, initial: walletName.slice(0, 1), color: "#C8922A" };

  useEffect(() => {
    void (async () => {
      try {
        const wallet = await loadWallet();
        if (wallet) {
          const items: WalletItem[] = wallet.accounts.map((acc) => ({
            id: acc.id,
            label: acc.name,
            initial: acc.name.slice(0, 1).toUpperCase(),
            color: "#C8922A",
            address: acc.address,
            accountIndex: acc.accountIndex,
          }));
          setWalletItems(items);
          setActiveWallet(wallet.activeAccountId);
          const active = wallet.accounts.find((a) => a.id === wallet.activeAccountId) ?? wallet.accounts[0];
          if (active) {
            setWalletAddress(active.address);
            setWalletName(active.name);
            if (active.quantumAddress) setQuantumAddress(active.quantumAddress);
            else { getQuantumAddress().then((qa) => { if (qa) setQuantumAddress(qa); }); }
            setBalanceLoading(true);
            try {
              const info = await getAddressInfo(active.address);
              setBalanceSatoshi(info.balance ?? 0);
              setTxHistory(info.transactions ?? []);
            } catch { /* alamat baru belum ada di chain */ }
            finally { setBalanceLoading(false); }
          }
        }
      } catch { /* wallet belum tersimpan */ }
    })();
  }, []);

  const refreshBalance = () => {
    if (!walletAddress) return;
    void getAddressInfo(walletAddress).then((info) => {
      setBalanceSatoshi(info.balance ?? 0);
      setTxHistory(info.transactions ?? []);
    }).catch(() => {});
  };

  const handleSwitchAccount = async (id: string) => {
    await setActiveAccount(id);
    setActiveWallet(id);
    const wallet = await loadWallet();
    if (wallet) {
      const active = wallet.accounts.find((a) => a.id === id);
      if (active) {
        setWalletAddress(active.address);
        setWalletName(active.name);
        setBalanceLoading(true);
        try {
          const info = await getAddressInfo(active.address);
          setBalanceSatoshi(info.balance ?? 0);
          setTxHistory(info.transactions ?? []);
        } catch { setBalanceSatoshi(0); setTxHistory([]); }
        finally { setBalanceLoading(false); }
      }
    }
  };

  const handleAction = (key: string) => {
    if (key === "beli") router.push("/beli");
    else if (key === "kirim") router.push("/kirim");
    else if (key === "terima") router.push("/terima");
    else if (key === "swap") setActiveTab("swap");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ height: topPad }} />

      <View style={{ flex: 1 }}>
          {activeTab === "p2p" && <TabP2P />}
          {activeTab === "swap" && <TabSwap walletAddress={walletAddress} balanceSatoshi={balanceSatoshi} onRefreshBalance={refreshBalance} />}
          {activeTab === "activity" && <TabActivity txHistory={txHistory} walletAddress={walletAddress} />}
          {activeTab === "cari" && <TabCari walletAddress={walletAddress} />}

          {activeTab === "home" && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 + bottomPad }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <TouchableOpacity
                  style={styles.hamburgerBtn}
                  activeOpacity={0.7}
                  onPress={() => setShowSidebar(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.hamburgerLine, { width: 20 }]} />
                  <View style={[styles.hamburgerLine, { width: 14 }]} />
                  <View style={[styles.hamburgerLine, { width: 17 }]} />
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.7} onPress={() => setShowSidebar(true)} style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[styles.walletDot, { backgroundColor: currentWallet.color }]} />
                    <Text style={[styles.walletName, { color: colors.foreground }]}>{currentWallet.label}</Text>
                    <Ionicons name={"chevron-down" as IoniconName} size={14} color={colors.mutedForeground} />
                  </View>
                  <Text style={[styles.walletTag, { color: colors.mutedForeground }]}>Dompet Utama</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.notifBtn} activeOpacity={0.7} onPress={() => router.push("/notifikasi" as any)}>
                  <Ionicons name="notifications-outline" size={22} color={colors.foreground} />
                  <View style={styles.notifBadge} />
                </TouchableOpacity>
              </View>

          <View style={styles.balanceCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.balanceLabel}>Saldo GRD</Text>
              <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
                <Ionicons name={(balanceVisible ? "eye-outline" : "eye-off-outline") as IoniconName} size={18} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>
            <Text style={styles.balanceAmount}>
              {balanceVisible
                ? (balanceLoading ? "Memuat..." : formatGRD(balanceSatoshi))
                : "••••••••"}
            </Text>
            <View style={styles.balanceFooter}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardSubLabel}>Alamat GarudaChain</Text>
                <TouchableOpacity
                  style={[styles.addressBadge, { flexDirection: "row", alignItems: "center", gap: 6 }]}
                  activeOpacity={0.7}
                  onPress={async () => {
                    if (walletAddress) {
                      await Clipboard.setStringAsync(walletAddress);
                    }
                  }}
                >
                  <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                    {walletAddress || "Belum ada dompet"}
                  </Text>
                  {!!walletAddress && (
                    <Ionicons name={"copy-outline" as IoniconName} size={13} color={NEO_MUTED} />
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.statusBlock}>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Aktif</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {ACTIONS.map((action) => (
              <TouchableOpacity key={action.key} style={styles.actionItem} activeOpacity={0.7} onPress={() => handleAction(action.key)}>
                <View style={styles.actionIconBg}>
                  <Ionicons name={action.icon as IoniconName} size={22} color={colors.foreground} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.foreground }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Asset sub-tabs */}
          <View style={styles.assetSubTabBar}>
            {(["kripto", "stablecoin", "saham"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.assetSubTabItem, assetSubTab === tab && styles.assetSubTabItemActive]}
                onPress={() => setAssetSubTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.assetSubTabText, assetSubTab === tab && styles.assetSubTabTextActive]}>
                  {tab === "kripto" ? "Kripto" : tab === "stablecoin" ? "Stablecoin" : "Saham"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Kripto tab */}
          {assetSubTab === "kripto" && (
            <View style={styles.assetList}>
              <TouchableOpacity
                style={styles.assetRow}
                activeOpacity={0.7}
                onPress={() => router.push("/detail-aset?id=native-grd")}
              >
                <AssetLogo symbol="GRD" tipe="NATIVE" size={44} />
                <View style={[styles.assetInfo, { marginLeft: 12 }]}>
                  <Text style={[styles.assetName, { color: colors.foreground }]}>GarudaChain</Text>
                  <Text style={[styles.assetSymbol, { color: colors.mutedForeground }]}>GRD · Native</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.assetBalance, { color: colors.foreground }]}>
                    {balanceVisible ? (balanceLoading ? "..." : formatGRD(balanceSatoshi)) : "••••"}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 2 }}>
                    GarudaChain
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Stablecoin tab */}
          {assetSubTab === "stablecoin" && (
            <View style={styles.assetList}>
              {assetsLoading && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular" }}>Memuat...</Text>
                </View>
              )}
              {!assetsLoading && liveStablecoins.length === 0 && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular" }}>Belum ada stablecoin</Text>
                </View>
              )}
              {liveStablecoins.map((asset, index) => (
                <TouchableOpacity
                  key={asset.assetId}
                  style={[styles.assetRow, index > 0 && { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/detail-aset?id=${asset.assetId}`)}
                >
                  <AssetLogo symbol={asset.symbol} tipe="STABLECOIN" size={44} />
                  <View style={[styles.assetInfo, { marginLeft: 12 }]}>
                    <Text style={[styles.assetName, { color: colors.foreground }]}>{asset.name}</Text>
                    <Text style={[styles.assetSymbol, { color: colors.mutedForeground }]}>{asset.symbol} · Stablecoin</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.assetBalance, { color: colors.foreground }]}>
                      {balanceVisible ? "0" : "••••"}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#2563EB", marginTop: 2 }}>
                      Stablecoin
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Saham tab */}
          {assetSubTab === "saham" && (
            <View style={styles.assetList}>
              {assetsLoading && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular" }}>Memuat...</Text>
                </View>
              )}
              {!assetsLoading && liveStocks.length === 0 && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular" }}>Belum ada saham</Text>
                </View>
              )}
              {liveStocks.map((asset, index) => (
                <TouchableOpacity
                  key={asset.assetId}
                  style={[styles.assetRow, index > 0 && { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/detail-aset?id=${asset.assetId}`)}
                >
                  <AssetLogo symbol={asset.symbol} tipe="SAHAM" size={44} />
                  <View style={[styles.assetInfo, { marginLeft: 12 }]}>
                    <Text style={[styles.assetName, { color: colors.foreground }]}>{asset.name}</Text>
                    <Text style={[styles.assetSymbol, { color: colors.mutedForeground }]}>{asset.symbol} · Pasar Saham</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.assetBalance, { color: colors.foreground }]}>
                      {balanceVisible ? "0" : "••••"}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#8B0000", marginTop: 2 }}>
                      Saham
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

        </ScrollView>
      )}

      <View style={[styles.tabBar, { paddingBottom: bottomPad + 4 }]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={styles.tabItem} activeOpacity={0.7} onPress={() => setActiveTab(tab.key)}>
              <Ionicons
                name={(isActive ? tab.icon : tab.icon + "-outline") as IoniconName}
                size={24}
                color={isActive ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        </View>
      </View>

      <LeftDrawer
        visible={showSidebar}
        wallets={walletItems}
        activeWallet={activeWallet}
        onSelectWallet={(id) => void handleSwitchAccount(id)}
        onAddAccount={() => { setShowSidebar(false); setShowAddAccount(true); }}
        onManageAccounts={() => { setShowSidebar(false); setShowManageAccounts(true); }}
        onSettings={() => { setShowSidebar(false); setShowSettings(true); }}
        onClose={() => setShowSidebar(false)}
        topPad={topPad}
        bottomPad={bottomPad}
      />

      <WalletPanel
        visible={showPanel}
        onClose={() => setShowPanel(false)}
        activeWallet={activeWallet}
        accounts={walletItems}
        onSelectWallet={(id) => { void handleSwitchAccount(id); setShowPanel(false); }}
        onAddAccount={() => { setShowPanel(false); setShowAddAccount(true); }}
        onManageAccounts={() => { setShowPanel(false); setShowManageAccounts(true); }}
        onSettings={() => { setShowPanel(false); setShowSettings(true); }}
        topPad={topPad}
        bottomPad={bottomPad}
        colors={colors}
      />

      <AddAccountSheet
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        bottomPad={bottomPad}
        topPad={topPad}
      />

      <ManageAccountsSheet
        visible={showManageAccounts}
        onClose={() => setShowManageAccounts(false)}
        activeWallet={activeWallet}
        accounts={walletItems}
        onSwitchAccount={(id) => void handleSwitchAccount(id)}
        onAddAccount={() => { setShowManageAccounts(false); setShowAddAccount(true); }}
        topPad={topPad}
        bottomPad={bottomPad}
      />

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        topPad={topPad}
        onManageAccounts={() => { setShowSettings(false); setShowManageAccounts(true); }}
        onNetworks={() => { setShowSettings(false); setShowNetworks(true); }}
        onConnectedApps={() => { setShowSettings(false); setShowConnectedApps(true); }}
        accountCount={walletItems.length}
      />

      <ActiveNetworksSheet
        visible={showNetworks}
        onClose={() => setShowNetworks(false)}
        topPad={topPad}
        bottomPad={bottomPad}
      />

      <ConnectedAppsSheet
        visible={showConnectedApps}
        onClose={() => setShowConnectedApps(false)}
        topPad={topPad}
        bottomPad={bottomPad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16 },
  walletInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  walletIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
    ...Platform.select<object>({
      web: { boxShadow: "4px 4px 10px #D1D5DD, -4px -4px 10px #FFFFFF" },
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
    }),
  },
  walletNameRow: { flexDirection: "row", alignItems: "center" },
  walletName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  walletTag: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  walletDot: { width: 10, height: 10, borderRadius: 5 },
  hamburgerBtn: { justifyContent: "center", gap: 4, paddingVertical: 4 },
  hamburgerLine: { height: 2, borderRadius: 1, backgroundColor: NEO_TEXT },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#ffffff" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", position: "relative" },
  notifBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: NEO_ACCENT, position: "absolute", top: 8, right: 8 },
  balanceCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    backgroundColor: "#F0F0F3",
    ...Platform.select<object>({
      web: { boxShadow: "8px 8px 20px #D1D5DD, -8px -8px 20px #FFFFFF" },
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 6, height: 6 }, shadowOpacity: 0.9, shadowRadius: 14, elevation: 8 },
    }),
  },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8A94A6", marginBottom: 6 },
  balanceAmount: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#C8922A", letterSpacing: -0.5, marginBottom: 20 },
  balanceFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cardSubLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#8A94A6", marginBottom: 4 },
  addressBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#F0F0F3",
    ...Platform.select<object>({
      web: { boxShadow: "inset 3px 3px 6px #D1D5DD, inset -3px -3px 6px #FFFFFF" },
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: -1, height: -1 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 0 },
    }),
  },
  addressText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#2D3748", letterSpacing: 0.3 },
  statusBlock: { alignItems: "flex-end" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28, gap: 10 },
  actionItem: { flex: 1, alignItems: "center", gap: 8 },
  actionIconBg: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
    ...Platform.select<object>({
      web: { boxShadow: "5px 5px 12px #D1D5DD, -5px -5px 12px #FFFFFF" },
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 5 },
    }),
  },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  assetSubTabBar: {
    flexDirection: "row",
    backgroundColor: "#E8E8EC",
    borderRadius: 14,
    padding: 3,
    marginBottom: 14,
  },
  assetSubTabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 11,
  },
  assetSubTabItemActive: {
    backgroundColor: NEO_BG,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  assetSubTabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  assetSubTabTextActive: { fontFamily: "Inter_700Bold", color: NEO_TEXT },
  assetList: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#F0F0F3",
    ...Platform.select<object>({
      web: { boxShadow: "6px 6px 14px #D1D5DD, -6px -6px 14px #FFFFFF" },
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 10, elevation: 6 },
    }),
  },
  assetRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  assetIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  assetLetter: { fontSize: 18, fontFamily: "Inter_700Bold" },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  assetSymbol: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  assetBalance: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingTop: 10,
    backgroundColor: "#F0F0F3",
    ...Platform.select<object>({
      web: { boxShadow: "0px -4px 12px #D1D5DD, 0px -1px 4px #FFFFFF" },
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.7, shadowRadius: 8, elevation: 10 },
    }),
  },
  tabItem: { flex: 1, alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
});

const sidebarStyles = StyleSheet.create({
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 260,
    backgroundColor: "#F0F0F3",
    flexDirection: "column",
    ...Platform.select<object>({
      web: { boxShadow: "4px 0px 20px #C0C4CC" },
      default: { shadowColor: "#B0B8C4", shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.9, shadowRadius: 16, elevation: 20 },
    }),
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.07)",
  },
  drawerBack: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F0F0F3",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "3px 3px 7px #D1D5DD, -3px -3px 7px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },
    }),
  },
  drawerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  drawerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 14,
  },
  drawerRowActive: { backgroundColor: NEO_ACCENT + "12" },
  drawerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerCircleText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  drawerWalletName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: NEO_MUTED,
    flex: 1,
  },
  drawerBottom: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.07)",
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  drawerBottomBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F0F0F3",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select<object>({
      web: { boxShadow: "4px 4px 9px #D1D5DD, -4px -4px 9px #FFFFFF" },
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 },
    }),
  },
});

const panelStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    shadowColor: "#C8D0DA",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 20,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    marginBottom: 8,
  },
  backLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#8492A6" },
  walletList: { flex: 1 },
  walletItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  walletAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  walletAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  walletLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  panelFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  footerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F0F0F3",
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltip: {
    position: "absolute",
    bottom: 52,
    left: "50%",
    transform: [{ translateX: -50 }],
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 100,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 999,
  },
  tooltipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#1a1a1a",
  },
  accountPopup: {
    position: "absolute",
    left: PANEL_WIDTH + 10,
    backgroundColor: "#F0F0F3",
    borderRadius: 14,
    padding: 14,
    width: 190,
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  accountPopupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  accountPopupName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#2D3748",
  },
  accountPopupBalance: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#2D3748",
  },
  accountPopupNetwork: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  networkIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  networkIconText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
  },
  networkName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#2D3748",
    flex: 1,
  },
  networkAddress: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8492A6",
  },
  accountPopupHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#8492A6",
    textAlign: "center",
  },
});

const addStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F0F0F3",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#C8D0DA",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0F0F3",
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#2D3748",
  },
  options: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 6,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#F0F0F3",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 3,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(200,146,42,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#2D3748",
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#8492A6",
  },
  closeBar: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F0F0F3",
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBarText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#8492A6",
  },
});

const manageStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F0F0F3",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#C8D0DA",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0F0F3",
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#2D3748",
  },
  list: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...Platform.select({
      web: { boxShadow: "3px 3px 8px #D1D5DD, -3px -3px 8px #FFFFFF" } as any,
      default: { shadowColor: "#D1D5DD", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
    }),
  },
  accountAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    flexShrink: 0,
  },
  accountInitial: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  accountName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: NEO_TEXT,
    flex: 1,
  },
  accountBalance: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: NEO_MUTED,
    marginRight: 8,
  },
  addBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: "#2D2D2D",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});

const settingStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F0F0F3",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#C8D0DA",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 24,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0F0F3",
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#2D3748",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F0F3",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: "#C8D0DA",
    shadowOffset: { width: -2, height: -2 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#8492A6",
    flex: 1,
  },
  scroll: {
    flex: 1,
    marginTop: 4,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F0F3",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 3,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#C8922A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  profileAvatarText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  profileName: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#2D3748",
    flex: 1,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#F0F0F3",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#D1D5DD",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 3,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.07)",
  },
  settingIconWrap: {
    width: 30,
    alignItems: "center",
    marginRight: 10,
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#2D3748",
    flex: 1,
  },
  settingBadge: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#8492A6",
    marginRight: 4,
  },
  lockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#C8922A",
  },
  lockBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
});

const tabContentStyles = StyleSheet.create({
  pageTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 16 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  filterChipActive: { backgroundColor: NEO_ACCENT },
  filterChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  filterChipTextActive: { color: "#ffffff" },
  cardList: { gap: 14 },
  p2pCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  p2pHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  traderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  traderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  traderAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  traderName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  traderStat: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 2 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  typeBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  p2pDetails: { flexDirection: "row", justifyContent: "space-between" },
  p2pLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  p2pValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  p2pFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)", paddingTop: 12 },
  paymentTag: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED, backgroundColor: "rgba(0,0,0,0.05)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  p2pBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8 },
  p2pBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" },

  /* ── New P2P listing styles ── */
  p2pTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  p2pSideToggle: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 20, padding: 3, gap: 0 },
  sideBtn: { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 18 },
  sideBtnActive: { backgroundColor: "#22C55E" },
  sideBtnActiveJual: { backgroundColor: "#EF4444" },
  sideBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  sideBtnTextActive: { color: "#fff" },
  p2pAlertBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.05)" },

  filterChipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "nowrap" },
  filterPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: NEO_BG, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  filterPillText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  filterIconBtn: { width: 38, height: 38, backgroundColor: NEO_BG, borderRadius: 12, alignItems: "center", justifyContent: "center", marginLeft: "auto" as any },

  promoLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 10 },
  promoSep: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginVertical: 8 },

  p2pCard2: { backgroundColor: NEO_BG, borderRadius: 18, padding: 14, flexDirection: "row", gap: 10 },
  traderRow2: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  traderAvatar2: { width: 30, height: 30, borderRadius: 15, backgroundColor: NEO_ACCENT + "22", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  traderAvatarText2: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  traderName2: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT, maxWidth: 140 },
  traderStats2: { fontSize: 10.5, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 1, lineHeight: 14 },

  priceLabel: { marginBottom: 3 },
  priceRp: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  priceValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  priceUnit: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },

  limitText: { fontSize: 11.5, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 2 },
  tersediaText: { fontSize: 11.5, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4 },

  verifikasiBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#3B82F611", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  verifikasiText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#3B82F6" },

  p2pRight: { width: 110, alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
  paymentMethodRow: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end" },
  paymentMethodText: { fontSize: 10.5, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "right" },
  payDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  timeLimitRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  timeLimitText: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  p2pBtn2: { borderRadius: 10, paddingHorizontal: 0, paddingVertical: 8, alignItems: "center", width: 72 },
  p2pBtnText2: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },

  emptyState: { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyStateText: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED },

  /* Jumlah bottom sheet */
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  jumlahSheet: { backgroundColor: NEO_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  jumlahSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  jumlahInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  jumlahInput: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", color: NEO_TEXT, padding: 0 },
  jumlahInputSuffix: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_MUTED },
  jumlahQuickRow: { flexDirection: "row", gap: 10 },
  jumlahQuickChip: { flex: 1, backgroundColor: NEO_BG, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
  jumlahQuickText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  jumlahBtnRow: { flexDirection: "row", gap: 12 },
  jumlahResetBtn: { flex: 1, backgroundColor: NEO_BG, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  jumlahResetText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  jumlahConfirmBtn: { flex: 1.6, backgroundColor: NEO_ACCENT, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  jumlahConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Pembayaran bottom sheet */
  pembayaranSheet: {
    backgroundColor: NEO_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
    gap: 0,
  },
  pembayaranSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
    marginBottom: 14,
  },
  pembayaranSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: NEO_TEXT,
    padding: 0,
  },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  paymentGridItem: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 10,
    position: "relative",
    overflow: "visible",
  },
  paymentGridItemActive: {
    borderWidth: 1.5,
    borderColor: NEO_ACCENT,
    backgroundColor: NEO_ACCENT + "0D",
  },
  paymentGridText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: NEO_TEXT,
    textAlign: "center",
  },
  paymentGridTextActive: {
    fontFamily: "Inter_700Bold",
    color: NEO_ACCENT,
  },
  popularDot: {
    position: "absolute",
    top: 6,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: NEO_ACCENT,
  },

  swapCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  swapLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  swapAssetIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  swapAssetLetter: { fontSize: 16, fontFamily: "Inter_700Bold" },
  swapAssetSymbol: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT, width: 48 },
  swapInput: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: NEO_TEXT,
    height: 50,
  },
  swapEstimated: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_MUTED, textAlign: "right" },
  swapBalance: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, paddingLeft: 2 },
  swapArrowBtn: { alignItems: "center", paddingVertical: 4 },
  swapArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  rateText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  rateFee: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  swapNowBtn: {
    height: 52,
    borderRadius: 15,
    backgroundColor: NEO_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    ...Platform.select<object>({
      web: { boxShadow: "4px 4px 10px #B07820, -4px -4px 10px #E0A840" },
      default: { shadowColor: "#B07820", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
    }),
  },
  swapNowText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" },
  activityCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    overflow: "hidden",
  },
  txRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  txBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  txType: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  txBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  txBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  txIDR: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: NEO_TEXT,
    height: 48,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  categoryChipActive: { backgroundColor: NEO_ACCENT },
  categoryChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  categoryChipTextActive: { color: "#ffffff" },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_MUTED, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  assetListCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    overflow: "hidden",
  },
  assetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  assetIconSm: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  assetLetterSm: { fontSize: 18, fontFamily: "Inter_700Bold" },
  assetName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  assetSymbol: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  assetPrice: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  assetChange: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  /* ── P2P 5-tab nav bar ── */
  p2pNavBar: {
    flexDirection: "row",
    backgroundColor: NEO_BG,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.07)",
    paddingTop: 4,
  },
  p2pNavItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    position: "relative",
  },
  p2pNavIconWrap: {
    position: "relative",
    marginBottom: 4,
  },
  p2pNavBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  p2pNavBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  p2pNavLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  p2pNavLabelActive: { color: NEO_ACCENT },
  p2pNavIndicator: {
    position: "absolute",
    bottom: 0,
    left: "15%",
    right: "15%",
    height: 2.5,
    borderRadius: 2,
    backgroundColor: NEO_ACCENT,
  },
  /* order section */
  orderSectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: NEO_MUTED,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  /* chat list */
  chatListCard: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chatTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  chatLastMsg: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, flex: 1, marginRight: 8 },
  chatUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: NEO_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  chatUnreadText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  /* profile */
  profCard: {
    backgroundColor: NEO_BG,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  profAvatarWrap: { position: "relative", marginBottom: 4 },
  profAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: NEO_ACCENT + "22",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: NEO_ACCENT,
  },
  profAvatarText: { fontSize: 36, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  profVerifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: -2,
    backgroundColor: NEO_BG,
    borderRadius: 12,
    padding: 1,
  },
  profName: { fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  profHandle: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  profRatingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  profRatingText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, marginLeft: 6 },
  profBadgeRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  profBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#3B82F611",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  profBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  profStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  profStatCard: {
    width: "47%",
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  profStatIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: NEO_ACCENT + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  profStatValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  profStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },
  profSection: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    marginBottom: 16,
  },
  profSectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: NEO_MUTED, letterSpacing: 0.8 },
  profPayRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  profPayText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  /* admin entry */
  adminDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  adminDividerLine: { flex: 1, height: 1, backgroundColor: "rgba(0,0,0,0.07)" },
  adminDividerText: { fontSize: 10, fontFamily: "Inter_700Bold", color: NEO_MUTED, letterSpacing: 1 },
  adminEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 16,
    marginBottom: 8,
  },
  adminEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: NEO_ACCENT + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  adminEntryTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  adminEntrySub: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 2 },

  /* ── Notification styles ── */
  notifSection: { gap: 10, marginBottom: 4 },
  notifHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  notifBellWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: NEO_ACCENT, alignItems: "center", justifyContent: "center" },
  notifHeaderText: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT, flex: 1 },
  notifCountBadge: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  notifCountText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  notifCard: { backgroundColor: NEO_BG, borderRadius: 18, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  notifCardLeft: { flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  notifAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  notifNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  notifBuyerName: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT, flex: 1 },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  notifActionRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  notifActionBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  notifActionText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  notifAmount: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  notifSep: { fontSize: 12, color: NEO_MUTED },
  notifIdr: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  notifPayRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  notifPayText: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  notifBtnCol: { gap: 6, alignItems: "flex-end", flexShrink: 0 },
  notifChatBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: NEO_ACCENT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  notifChatBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  notifIgnoreBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  notifIgnoreBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  notifHistoryLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, letterSpacing: 0.6, marginTop: 8, marginBottom: 2 },
  notifHistCard: { backgroundColor: NEO_BG, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  notifStatusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  notifStatusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  /* legacy compat (keep) */
  orderBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  orderBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  // Buat Iklan button
  buatIklanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  buatIklanText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  // My Listings
  myListingCard: { backgroundColor: NEO_BG, borderRadius: 20, padding: 16, gap: 12 },
  myListingTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myListingAsset: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  myListingDetails: { flexDirection: "row", justifyContent: "space-between" },
  myListingFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)", paddingTop: 12 },
  myListingAction: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: NEO_ACCENT + "15", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  myListingActionText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  // Incoming Orders
  orderCard: { backgroundColor: NEO_BG, borderRadius: 20, padding: 16, gap: 12 },
  orderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderDetails: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  chatArrow: { flexDirection: "row", alignItems: "center", gap: 4 },
  chatArrowText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
});

const swapStyles = StyleSheet.create({
  modeTabs: {
    flexDirection: "row",
    backgroundColor: "#E8E8EC",
    borderRadius: 14,
    padding: 3,
    marginBottom: 14,
  },
  modeTab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 11 },
  modeTabActive: {
    backgroundColor: NEO_BG,
    ...Platform.select<object>({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
    }),
  },
  modeTabText: { fontSize: 14, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  modeTabTextActive: { fontFamily: "Inter_700Bold", color: NEO_TEXT },
  walletBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  walletLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, flex: 1 },
  walletValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  card: {
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 18,
    gap: 0,
    marginBottom: 16,
  },
  dirRow: { flexDirection: "row", gap: 0, marginBottom: 16, borderRadius: 12, overflow: "hidden" },
  dirBtn: { flex: 1, alignItems: "center", paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.05)" },
  dirBtnBuy: { backgroundColor: "#22C55E" },
  dirBtnSell: { backgroundColor: "#EF4444" },
  dirBtnActive: { backgroundColor: NEO_ACCENT },
  dirBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  chipActive: { backgroundColor: NEO_ACCENT },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  chipTextActive: { color: "#fff" },
  rateBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  rateLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, flex: 1 },
  rateValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  input: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: NEO_TEXT,
    marginBottom: 14,
  },
  estimateBox: {
    backgroundColor: "#22C55E15",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  estimateLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4 },
  estimateValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#22C55E" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 15,
    backgroundColor: NEO_ACCENT,
    marginBottom: 10,
  },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  note: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },
});

const dexStyles = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pairBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
  pairSymbolRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pairSymbol: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  pairBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  pairBadgeSwap: { backgroundColor: "#EFF6FF" },
  pairBadgeOrder: { backgroundColor: "#FFF0F0" },
  pairBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  balanceBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  balanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },

  // Stats bar
  statsBar: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  statsName: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  statsPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    ...Platform.select<object>({
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    paddingVertical: 10,
  },
  cardHeaderText: { fontSize: 12, fontFamily: "Inter_700Bold", color: DEX_RED },

  // Side toggle (Beli/Jual, Buy/Sell)
  sideRow: { flexDirection: "row" },
  sideBtn: { flex: 1, alignItems: "center", paddingVertical: 11, backgroundColor: "#F3F4F6" },
  sideBtnBuy: { backgroundColor: "#22C55E" },
  sideBtnSell: { backgroundColor: "#CC0001" },
  sideBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_MUTED },

  // Order type tabs (Market / Limit)
  orderTypeTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.07)",
  },
  orderTypeTab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  orderTypeTabActive: { borderBottomWidth: 2, borderBottomColor: DEX_RED },
  orderTypeTabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  orderTypeTabTextActive: { fontFamily: "Inter_700Bold", color: NEO_TEXT },

  // Info box (rate, balance, etc)
  infoBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
    gap: 5,
    marginHorizontal: 14,
    marginTop: 12,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  infoValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  infoValueMono: { fontSize: 12, fontFamily: Platform.OS === "web" ? "monospace" : "Courier", color: NEO_TEXT },

  // Inputs
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED, paddingHorizontal: 14, marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 8,
    marginHorizontal: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
    color: NEO_TEXT,
    marginBottom: 0,
  },
  inputRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, gap: 8 },
  inputUnit: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, width: 40, textAlign: "right" },

  // Quick % buttons
  pctRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, marginTop: 8 },
  pctBtn: { flex: 1, alignItems: "center", paddingVertical: 5, borderRadius: 6, backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  pctBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },

  // Estimated output
  estimateBox: {
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 14,
    marginTop: 12,
  },
  estimateLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4 },
  estimateValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#15803D" },

  // Execute button
  execBtn: {
    backgroundColor: DEX_RED,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 10,
  },
  execBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  noteText: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", paddingHorizontal: 14, paddingBottom: 12 },

  // My orders
  ordersSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    ...Platform.select<object>({
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    }),
  },
  ordersHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  ordersHeaderText: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  ordersBadge: { backgroundColor: DEX_RED, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  ordersBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  ordersEmpty: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, padding: 16, textAlign: "center" },
  orderRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.04)" },
  orderSide: { fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 2 },
  orderDetail: { fontSize: 11, fontFamily: Platform.OS === "web" ? "monospace" : "Courier", color: NEO_MUTED },
  cancelBtn: { backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  cancelBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#B91C1C" },

  // ── Token selector (inside swap box) ───────────────────────────────────
  tokenSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  tokenSelectorText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: NEO_TEXT,
  },
  tokenSelectorSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: NEO_MUTED,
  },

  // ── Swap Pay/Receive boxes ──────────────────────────────────────────────
  swapBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 2,
    overflow: "hidden",
    ...Platform.select<object>({
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
    }),
  },
  swapBoxLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  swapBoxBalance: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  tokenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 0,
  },
  tokenBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  swapAmountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: NEO_TEXT,
    textAlign: "right" as const,
    height: 44,
    ...Platform.select<object>({ web: { outlineStyle: "none" } }),
  },
  swapDirBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    ...Platform.select<object>({
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.1)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    }),
  },
  swapEstimateText: {
    flex: 1,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: NEO_MUTED,
    textAlign: "right" as const,
  },
  tokenIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NEO_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },

  // Picker modal
  pickerModal: { flex: 1, backgroundColor: "#fff" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  pickerFilterRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  pickerFilterText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED, paddingHorizontal: 8, paddingVertical: 4 },
  pickerFilterTextActive: { fontFamily: "Inter_700Bold", color: DEX_RED, textDecorationLine: "underline" },
  pickerSearch: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginLeft: 8, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pickerSearchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT, height: 28 },
  pickerTableHeader: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)", backgroundColor: "#F9FAFB" },
  pickerTableHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  pickerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.04)" },
  pickerRowSymbol: { fontSize: 14, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 2 },
  pickerRowName: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  pickerRowPrice: { fontSize: 12, fontFamily: Platform.OS === "web" ? "monospace" : "Courier", color: NEO_TEXT },
});
