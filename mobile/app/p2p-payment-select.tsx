import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  NEO_BG,
  NEO_TEXT,
  NEO_MUTED,
  NEO_ACCENT,
  neoRaisedMd,
  neoInset,
} from "@/constants/neo";

type Account = {
  id: string;
  method: string;
  bankName: string;
  holderName: string;
  number: string;
};

const EWALLET_COLOR: Record<string, string> = {
  GoPay: "#00AAD4",
  OVO: "#4C3494",
  DANA: "#118EEA",
  "DANA(Indonesia)": "#118EEA",
  ShopeePay: "#EE4D2D",
  LinkAja: "#E82529",
};

const SUPPORTED_METHODS = [
  { name: "OVO", color: "#4C3494" },
  { name: "GoPay", color: "#00AAD4" },
  { name: "DANA(Indonesia)", color: "#118EEA" },
  { name: "ShopeePay", color: "#EE4D2D" },
  { name: "Transfer Bank", color: "#6B7280" },
  { name: "BCA", color: "#003D82" },
  { name: "BRI", color: "#00529B" },
  { name: "Bank Mandiri", color: "#003087" },
];

const DEMO_ACCOUNTS: Account[] = [
  { id: "a1", method: "GoPay", bankName: "", holderName: "DOMPET DIGITAL USER", number: "081401669402" },
  { id: "a2", method: "GoPay", bankName: "", holderName: "DOMPET DIGITAL USER", number: "085893937513" },
  { id: "a3", method: "OVO", bankName: "", holderName: "DOMPET DIGITAL USER", number: "085893937513" },
];

const EWALLET_NAMES = ["GoPay", "OVO", "DANA", "DANA(Indonesia)", "ShopeePay", "LinkAja"];

const isEwallet = (method: string) =>
  EWALLET_NAMES.some((e) => method.toLowerCase().includes(e.toLowerCase()));

const isBank = (method: string) => !isEwallet(method);

export default function P2PPaymentSelectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string>("a1");
  const [accounts, setAccounts] = useState<Account[]>(DEMO_ACCOUNTS);

  /* Edit sheet state */
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [editBankName, setEditBankName] = useState("");
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");

  const openEdit = (acc: Account) => {
    setEditTarget(acc);
    setEditBankName(acc.bankName);
    setEditName(acc.holderName);
    setEditNumber(acc.number);
  };

  const closeEdit = () => setEditTarget(null);

  const saveEdit = () => {
    if (!editTarget) return;
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === editTarget.id
          ? { ...a, bankName: editBankName.trim(), holderName: editName.trim(), number: editNumber.trim() }
          : a
      )
    );
    closeEdit();
  };

  const deleteAccount = () => {
    if (!editTarget) return;
    setAccounts((prev) => prev.filter((a) => a.id !== editTarget.id));
    if (selectedId === editTarget.id) setSelectedId("");
    closeEdit();
  };

  /* Add new method — opens edit sheet pre-filled for new entry */
  const handleAdd = (method: string) => {
    const newAcc: Account = {
      id: `a${Date.now()}`,
      method,
      bankName: "",
      holderName: "",
      number: "",
    };
    setAccounts((prev) => [...prev, newAcc]);
    setEditTarget(newAcc);
    setEditBankName("");
    setEditName("");
    setEditNumber("");
  };

  const methodColor = (method: string) =>
    EWALLET_COLOR[method] ?? "#6B7280";

  const addedMethods = accounts.map((a) => a.method.toLowerCase());
  const notAdded = SUPPORTED_METHODS.filter(
    (m) => !addedMethods.includes(m.name.toLowerCase())
  );

  const numberLabel = editTarget
    ? isBank(editTarget.method) ? "Nomor Rekening" : "Nomor HP / Akun"
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: NEO_BG }}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[s.backBtn, neoRaisedMd]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Metode Pembayaran P2P</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Pilih metode pembayaran */}
        <Text style={s.sectionLabel}>Pilih metode pembayaran</Text>

        {accounts.length === 0 && (
          <View style={s.emptyBox}>
            <Ionicons name="card-outline" size={32} color={NEO_MUTED} />
            <Text style={s.emptyText}>Belum ada metode pembayaran tersimpan</Text>
          </View>
        )}

        {accounts.map((acc) => {
          const isSelected = selectedId === acc.id;
          return (
            <TouchableOpacity
              key={acc.id}
              style={[s.accountCard, neoRaisedMd, isSelected && s.accountCardSelected]}
              onPress={() => setSelectedId(acc.id)}
              activeOpacity={0.85}
            >
              <View style={s.accountLeft}>
                <View style={[s.methodStrip, { backgroundColor: methodColor(acc.method) }]} />
                <View style={{ gap: 3 }}>
                  <Text style={[s.methodName, isSelected && { color: NEO_ACCENT }]}>
                    {isBank(acc.method) && acc.bankName ? acc.bankName : acc.method}
                  </Text>
                  <Text style={s.holderName}>{acc.holderName || "—"}</Text>
                  <Text style={s.accountNum}>{acc.number || "—"}</Text>
                </View>
              </View>
              <View style={s.accountRight}>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color={NEO_ACCENT} />
                )}
                <TouchableOpacity
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => openEdit(acc)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="open-outline" size={18} color={NEO_MUTED} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Tambahkan metode */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>
          Tambahkan metode pembayaran yang didukung
        </Text>

        {notAdded.map((m) => (
          <TouchableOpacity
            key={m.name}
            style={[s.addCard, neoRaisedMd]}
            onPress={() => handleAdd(m.name)}
            activeOpacity={0.85}
          >
            <View style={s.accountLeft}>
              <View style={[s.methodStrip, { backgroundColor: m.color }]} />
              <Text style={s.methodName}>{m.name}</Text>
            </View>
            <Ionicons name="add" size={22} color={NEO_MUTED} />
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom: Konfirmasi */}
      {selectedId !== "" && (
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={s.confirmBtn}
            onPress={() => router.back()}
            activeOpacity={0.88}
          >
            <Text style={s.confirmBtnText}>Konfirmasi</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Edit Bottom Sheet ── */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={closeEdit}
      >
        <Pressable style={s.overlay} onPress={closeEdit} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.sheetWrapper}
        >
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Sheet handle */}
            <View style={s.sheetHandle} />

            {/* Method header */}
            <View style={s.sheetMethodRow}>
              <View
                style={[
                  s.sheetMethodDot,
                  { backgroundColor: editTarget ? methodColor(editTarget.method) : "#ccc" },
                ]}
              />
              <Text style={s.sheetMethodName}>{editTarget?.method}</Text>
            </View>

            {/* Nama Bank — hanya untuk metode bank */}
            {editTarget && isBank(editTarget.method) && (
              <>
                <Text style={s.fieldLabel}>Nama Bank</Text>
                <View style={[s.fieldInput, neoInset]}>
                  <TextInput
                    style={s.fieldText}
                    placeholder="Contoh: Bank Central Asia (BCA)"
                    placeholderTextColor={NEO_MUTED}
                    value={editBankName}
                    onChangeText={setEditBankName}
                    autoCapitalize="words"
                  />
                </View>
              </>
            )}

            {/* Nama Pemilik Akun */}
            <Text style={s.fieldLabel}>Nama Pemilik Akun</Text>
            <View style={[s.fieldInput, neoInset]}>
              <TextInput
                style={s.fieldText}
                placeholder="Masukkan nama sesuai akun"
                placeholderTextColor={NEO_MUTED}
                value={editName}
                onChangeText={setEditName}
                autoCapitalize="characters"
              />
            </View>

            {/* Nomor HP / Rekening */}
            <Text style={s.fieldLabel}>{numberLabel}</Text>
            <View style={[s.fieldInput, neoInset]}>
              <TextInput
                style={s.fieldText}
                placeholder="Masukkan nomor"
                placeholderTextColor={NEO_MUTED}
                keyboardType="phone-pad"
                value={editNumber}
                onChangeText={setEditNumber}
              />
            </View>

            {/* Buttons */}
            {(() => {
              const bankOk = !editTarget || !isBank(editTarget.method) || editBankName.trim() !== "";
              const isValid = bankOk && editName.trim() !== "" && editNumber.trim() !== "";
              return (
                <View style={s.sheetBtnRow}>
                  <TouchableOpacity
                    style={s.deleteBtnSmall}
                    onPress={deleteAccount}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    <Text style={s.deleteBtnText}>Hapus</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtnLarge, { opacity: isValid ? 1 : 0.5 }]}
                    onPress={saveEdit}
                    disabled={!isValid}
                    activeOpacity={0.85}
                  >
                    <Text style={s.saveBtnText}>Simpan</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12, backgroundColor: NEO_BG,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },

  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 10 },

  sectionLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_MUTED, marginBottom: 4 },

  accountCard: {
    backgroundColor: NEO_BG, borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: "transparent",
  },
  accountCardSelected: { borderColor: NEO_ACCENT },

  accountLeft: { flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1 },
  methodStrip: { width: 4, borderRadius: 2, alignSelf: "stretch", minHeight: 44 },
  methodName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  holderName: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  accountNum: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  accountRight: { flexDirection: "row", alignItems: "center", gap: 12 },

  addCard: {
    backgroundColor: NEO_BG, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },

  emptyBox: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },

  bottomBar: {
    paddingHorizontal: 16, paddingTop: 12, backgroundColor: NEO_BG,
    borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)",
  },
  confirmBtn: { backgroundColor: NEO_ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  confirmBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },

  /* Modal / Sheet */
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheetWrapper: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: NEO_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 14, gap: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)", alignSelf: "center", marginBottom: 8,
  },
  sheetMethodRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  sheetMethodDot: { width: 12, height: 12, borderRadius: 6 },
  sheetMethodName: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },

  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED, marginBottom: 2 },
  fieldInput: {
    backgroundColor: NEO_BG, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldText: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT, padding: 0 },

  sheetBtnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  deleteBtnSmall: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#EF4444",
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14,
  },
  deleteBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  saveBtnLarge: {
    flex: 1, backgroundColor: NEO_ACCENT,
    borderRadius: 14, paddingVertical: 14, alignItems: "center",
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
