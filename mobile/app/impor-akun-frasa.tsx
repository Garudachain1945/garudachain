import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Alert, ScrollView, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT } from "@/constants/neo";
import { loadWallet, addAccount, setActiveAccount, saveQuantumAddress } from "@/utils/wallet-storage";
import { validateMnemonic, deriveKey, deriveQuantumKey } from "@/utils/wallet-crypto";

export default function ImporAkunFrasaScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [phrase, setPhrase] = useState("");
  const [name, setName] = useState("Akun Impor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  const wordCount = phrase.trim() === "" ? 0 : phrase.trim().split(/\s+/).length;
  const isValid = (wordCount === 12 || wordCount === 24) && validateMnemonic(phrase.trim());

  const handlePaste = async () => {
    try { const t = await Clipboard.getStringAsync(); if (t) setPhrase(t); } catch {}
  };

  const handleImport = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError("");
    try {
      const wallet = await loadWallet();
      const accountIndex = wallet ? wallet.accounts.length : 0;
      const key = await deriveKey(phrase.trim(), 0);
      const qkey = await deriveQuantumKey(phrase.trim(), 0);
      const accountId = `imported-frasa-${Date.now()}`;
      const newAccount = {
        id: accountId,
        name: name.trim() || "Akun Impor",
        address: key.address,
        publicKey: key.publicKeyHex,
        accountIndex,
        quantumAddress: qkey.address,
      };
      await addAccount(newAccount);
      await setActiveAccount(accountId);
      Alert.alert("Berhasil", `Akun "${newAccount.name}" berhasil diimpor dari frasa pemulihan.`, [
        { text: "OK", onPress: () => router.replace("/beranda") },
      ]);
    } catch {
      setError("Gagal mengimpor. Periksa frasa pemulihan Anda.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Impor Frasa Pemulihan</Text>
        <TouchableOpacity onPress={() => setShowInfo(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="information-circle-outline" size={22} color={NEO_MUTED} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: bottomPad + 32 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Impor akun baru menggunakan frasa pemulihan yang berbeda. Dompet utama Anda tidak akan terpengaruh.</Text>

        <Text style={styles.label}>Nama Akun</Text>
        <View style={styles.inputWrap}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nama akun" placeholderTextColor={NEO_MUTED} autoCorrect={false} />
        </View>

        <Text style={[styles.label, { marginTop: 20 }]}>Frasa Pemulihan (12 atau 24 kata)</Text>
        <View style={[styles.textAreaWrap, { borderColor: phrase.length > 0 ? NEO_ACCENT : "rgba(0,0,0,0.1)" }]}>
          <TextInput
            style={styles.textArea}
            multiline
            value={phrase}
            onChangeText={(t) => { setPhrase(t); setError(""); }}
            placeholder="Masukkan frasa pemulihan, pisahkan dengan spasi..."
            placeholderTextColor={NEO_MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste} activeOpacity={0.7}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT }}>Tempel</Text>
          </TouchableOpacity>
        </View>
        {phrase.trim().length > 0 && (
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, color: isValid ? NEO_ACCENT : NEO_MUTED }}>
            {wordCount} dari 12/24 kata
          </Text>
        )}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: isValid && !loading ? NEO_ACCENT : "#D1D5DD" }]}
          disabled={!isValid || loading}
          activeOpacity={isValid ? 0.85 : 1}
          onPress={handleImport}
        >
          <Text style={[styles.btnText, { color: isValid && !loading ? "#fff" : NEO_MUTED }]}>
            {loading ? "Mengimpor..." : "Impor Akun"}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showInfo} transparent animationType="slide" onRequestClose={() => setShowInfo(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} activeOpacity={1} onPress={() => setShowInfo(false)} />
        <View style={[styles.infoSheet, { paddingBottom: bottomPad + 16 }]}>
          <Text style={styles.infoTitle}>Impor vs Buat Akun Baru</Text>
          <Text style={styles.infoBody}>Fitur ini menambahkan akun dari frasa pemulihan yang <Text style={{ fontFamily: "Inter_700Bold" }}>berbeda</Text>. Cocok untuk menggabungkan dua dompet dalam satu aplikasi.</Text>
          <Text style={[styles.infoBody, { marginTop: 12 }]}>Akun yang diimpor tetap menggunakan frasa pemulihan aslinya untuk pemulihan di masa depan.</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: NEO_ACCENT, marginTop: 20 }]} onPress={() => setShowInfo(false)}>
            <Text style={[styles.btnText, { color: "#fff" }]}>Mengerti</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 20, marginTop: 20, marginBottom: 8 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 8, marginTop: 12 },
  inputWrap: { backgroundColor: "#E8E8EB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, outlineStyle: "none" as any },
  textAreaWrap: { borderWidth: 1.5, borderRadius: 14, padding: 14, minHeight: 140 },
  textArea: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 22, minHeight: 80, outlineStyle: "none" as any },
  pasteBtn: { alignSelf: "flex-end", marginTop: 8 },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#EF4444", marginTop: 6 },
  footer: { paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  btn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  infoSheet: { backgroundColor: NEO_BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 24 },
  infoTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 12 },
  infoBody: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 22 },
});
