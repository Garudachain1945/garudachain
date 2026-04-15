/**
 * Set password untuk wallet yang sudah ada (impor / wallet lama tanpa password).
 * TIDAK generate mnemonic baru — hanya menyimpan password untuk wallet yang sudah ada.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { savePasswordHash } from "@/utils/wallet-storage";

export default function SetPasswordOnlyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [showCf, setShowCf]           = useState(false);
  const [saving, setSaving]           = useState(false);

  const isValid = password.length >= 8 && password === confirm;

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await savePasswordHash(password);
      router.replace("/beranda");
    } catch {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Buat Kata Sandi
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Buat kata sandi untuk membuka dompet di perangkat ini.
        </Text>

        {/* Password */}
        <Text style={[styles.label, { color: colors.foreground }]}>Kata sandi baru</Text>
        <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            secureTextEntry={!showPw}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Minimal 8 karakter"
            placeholderTextColor={colors.mutedForeground}
          />
          <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Confirm */}
        <Text style={[styles.label, { color: colors.foreground, marginTop: 20 }]}>Konfirmasi kata sandi</Text>
        <View style={[styles.inputWrap, {
          borderColor: confirm.length > 0 && confirm !== password ? "#ef4444" : colors.border,
          backgroundColor: colors.card,
        }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            secureTextEntry={!showCf}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Ulangi kata sandi"
            placeholderTextColor={colors.mutedForeground}
          />
          <TouchableOpacity onPress={() => setShowCf(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={showCf ? "eye-off-outline" : "eye-outline"} size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        {confirm.length > 0 && confirm !== password && (
          <Text style={styles.errorText}>Kata sandi tidak cocok</Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: isValid && !saving ? "#C8922A" : colors.secondary }]}
          activeOpacity={isValid ? 0.8 : 1}
          disabled={!isValid || saving}
          onPress={handleSave}
        >
          <Text style={[styles.btnText, { color: isValid && !saving ? "#ffffff" : colors.mutedForeground }]}>
            {saving ? "Menyimpan..." : "Simpan & Buka Dompet"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 8, marginTop: 8 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 32 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, paddingHorizontal: 16, height: 56,
    borderWidth: 1.5,
  },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#ef4444", marginTop: 6 },
  footer: { paddingTop: 16 },
  btn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
