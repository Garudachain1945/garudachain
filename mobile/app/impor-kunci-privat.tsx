import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Alert, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT, neoRaisedMd } from "@/constants/neo";
import { loadWallet, addAccount, setActiveAccount, saveImportedKey } from "@/utils/wallet-storage";
import { deriveKeyFromPrivate } from "@/utils/wallet-crypto";

export default function ImporKunciPrivatScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [privateKey, setPrivateKey] = useState("");
  const [name, setName] = useState("Akun Impor");
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  const isValid = /^[0-9a-fA-F]{64}$/.test(privateKey.trim());

  const handleImport = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError("");
    try {
      const wallet = await loadWallet();
      const accountIndex = wallet ? wallet.accounts.length : 0;
      const { address, publicKeyHex } = await deriveKeyFromPrivate(privateKey.trim().toLowerCase());
      const accountId = `imported-${Date.now()}`;
      const newAccount = {
        id: accountId,
        name: name.trim() || "Akun Impor",
        address,
        publicKey: publicKeyHex,
        accountIndex,
      };
      await addAccount(newAccount);
      await saveImportedKey(accountId, privateKey.trim().toLowerCase());
      await setActiveAccount(accountId);
      Alert.alert("Berhasil", `Akun "${newAccount.name}" berhasil diimpor.`, [
        { text: "OK", onPress: () => router.replace("/beranda") },
      ]);
    } catch {
      setError("Kunci privat tidak valid. Pastikan 64 karakter hex.");
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
        <Text style={styles.headerTitle}>Impor Kunci Privat</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: bottomPad + 32 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.warningBox]}>
          <Ionicons name="warning-outline" size={20} color="#C8922A" />
          <Text style={styles.warningText}>Jangan pernah bagikan kunci privat Anda kepada siapa pun.</Text>
        </View>

        <Text style={styles.label}>Nama Akun</Text>
        <View style={[styles.inputWrap, neoRaisedMd]}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nama akun"
            placeholderTextColor={NEO_MUTED}
            autoCorrect={false}
          />
        </View>

        <Text style={[styles.label, { marginTop: 20 }]}>Kunci Privat (64 karakter hex)</Text>
        <View style={[styles.inputWrap, neoRaisedMd]}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={privateKey}
            onChangeText={(t) => { setPrivateKey(t); setError(""); }}
            placeholder="Tempel kunci privat hex di sini"
            placeholderTextColor={NEO_MUTED}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={showKey ? "eye-off-outline" : "eye-outline"} size={18} color={NEO_MUTED} />
          </TouchableOpacity>
        </View>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {privateKey.length > 0 && !isValid && (
          <Text style={styles.errorText}>{privateKey.trim().length}/64 karakter</Text>
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#FFF8E7", borderRadius: 12, padding: 14, marginTop: 24, marginBottom: 8 },
  warningText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#92610A", lineHeight: 20 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 8, marginTop: 20 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  input: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, outlineStyle: "none" as any },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#EF4444", marginTop: 6 },
  footer: { paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  btn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
