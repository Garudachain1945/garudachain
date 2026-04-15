import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoInset, neoAccentBtn,
} from "@/constants/neo";

const STORAGE_KEY = "garuda_address_book";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface Address {
  id: string;
  name: string;
  address: string;
  network: string;
  networkColor: string;
}


export default function BukuAlamatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const NETWORKS = [
    { label: "GarudaChain", color: "#C8922A" },
  ];
  const [newNetwork] = useState("GarudaChain");

  useEffect(() => {
    void (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setAddresses(JSON.parse(saved));
    })();
  }, []);

  const persist = async (list: Address[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const filtered = addresses.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.address.toLowerCase().includes(search.toLowerCase()) ||
      a.network.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = async (addr: Address) => {
    await Clipboard.setStringAsync(addr.address);
    setCopiedId(addr.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    setAddresses((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      void persist(updated);
      return updated;
    });
  };

  const handleAdd = () => {
    if (!newName.trim() || !newAddress.trim()) return;
    const net = NETWORKS.find((n) => n.label === newNetwork)!;
    const updated = [
      ...addresses,
      {
        id: `a${Date.now()}`,
        name: newName.trim(),
        address: newAddress.trim(),
        network: net.label,
        networkColor: net.color,
      },
    ];
    setAddresses(updated);
    void persist(updated);
    setNewName("");
    setNewAddress("");
    setShowAddModal(false);
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
        <Text style={styles.headerTitle}>Buku Alamat</Text>
        <TouchableOpacity
          style={[styles.addBtn, neoRaisedMd]}
          onPress={() => setShowAddModal(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={"add" as IoniconName} size={22} color={NEO_ACCENT} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBar, neoInset, { marginHorizontal: 20, marginTop: 12, marginBottom: 4 }]}>
        <Ionicons name={"search-outline" as IoniconName} size={18} color={NEO_MUTED} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau alamat..."
          placeholderTextColor={NEO_MUTED}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={NEO_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name={"book-outline" as IoniconName} size={48} color={NEO_MUTED} />
            <Text style={styles.emptyText}>Tidak ada alamat tersimpan</Text>
            <TouchableOpacity
              style={[styles.emptyAddBtn, neoRaisedMd]}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name={"add" as IoniconName} size={18} color={NEO_ACCENT} />
              <Text style={styles.emptyAddText}>Tambah Alamat</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.addressCard, neoRaisedMd]}>
          {filtered.map((addr, i) => (
            <View
              key={addr.id}
              style={[styles.addrRow, i > 0 && styles.addrRowBorder]}
            >
              <View style={[styles.addrAvatar, { backgroundColor: addr.networkColor + "20" }]}>
                <Text style={[styles.addrAvatarText, { color: addr.networkColor }]}>
                  {addr.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.addrInfo}>
                <Text style={styles.addrName}>{addr.name}</Text>
                <Text style={styles.addrAddress} numberOfLines={1}>
                  {addr.address.slice(0, 14)}...{addr.address.slice(-8)}
                </Text>
                <View style={[styles.networkBadge, { backgroundColor: addr.networkColor + "15" }]}>
                  <Text style={[styles.networkBadgeText, { color: addr.networkColor }]}>{addr.network}</Text>
                </View>
              </View>
              <View style={styles.addrActions}>
                <TouchableOpacity
                  style={styles.addrActionBtn}
                  onPress={() => handleCopy(addr)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={(copiedId === addr.id ? "checkmark-circle" : "copy-outline") as IoniconName}
                    size={20}
                    color={copiedId === addr.id ? "#22C55E" : NEO_MUTED}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addrActionBtn}
                  onPress={() => handleDelete(addr.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={"trash-outline" as IoniconName} size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAddModal(false)}
        />
        <View style={[styles.modalSheet, { paddingBottom: bottomPad + 24 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Tambah Alamat Baru</Text>

          <Text style={styles.inputLabel}>Nama Label</Text>
          <View style={[styles.inputWrap, neoInset]}>
            <TextInput
              style={styles.inputText}
              placeholder="contoh: Dompet Kerja"
              placeholderTextColor={NEO_MUTED}
              value={newName}
              onChangeText={setNewName}
            />
          </View>

          <Text style={styles.inputLabel}>Alamat GarudaChain</Text>
          <View style={[styles.inputWrap, neoInset]}>
            <TextInput
              style={styles.inputText}
              placeholder="grd1q..."
              placeholderTextColor={NEO_MUTED}
              value={newAddress}
              onChangeText={setNewAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.inputLabel}>Jaringan</Text>
          <View style={styles.networkRow}>
            {NETWORKS.map((n) => (
              <View
                key={n.label}
                style={[styles.networkChip, { backgroundColor: n.color + "20", borderColor: n.color }]}
              >
                <Text style={[styles.networkChipText, { color: n.color, fontFamily: "Inter_600SemiBold" }]}>
                  {n.label}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, neoAccentBtn, (!newName.trim() || !newAddress.trim()) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={!newName.trim() || !newAddress.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>Simpan Alamat</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
            <Text style={styles.cancelBtnText}>Batal</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
  },
  addBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  searchBar: {
    flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 12, gap: 10,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  emptyAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: NEO_BG, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
  },
  emptyAddText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  addressCard: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden" },
  addrRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  addrRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  addrAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  addrAvatarText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  addrInfo: { flex: 1 },
  addrName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  addrAddress: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4 },
  networkBadge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  networkBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  addrActions: { flexDirection: "row", gap: 4 },
  addrActionBtn: { padding: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    backgroundColor: NEO_BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 16,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#D1D5DD", alignSelf: "center", marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 20 },
  inputLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8,
  },
  inputWrap: { borderRadius: 14, padding: 14, marginBottom: 16 },
  inputText: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT },
  networkRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  networkChip: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: "transparent",
    alignItems: "center",
  },
  networkChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  saveBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_MUTED },
});
