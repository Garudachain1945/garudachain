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
import { useWalletSetup } from "@/context/WalletSetupContext";
import { generateMnemonic } from "@/utils/wallet-crypto";

export default function BuatKataSandiScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setMnemonic, setPassword: savePassword } = useWalletSetup();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const isValid =
    password.length >= 8 && password === confirmPassword && agreed;

  function handleSubmit() {
    if (!isValid) return;
    const phrase = generateMnemonic();
    setMnemonic(phrase);
    savePassword(password);
    router.push("/frasa-pemulihan");
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topPad },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Kata sandi Dompet Digital
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Buka Dompet Digital hanya pada perangkat ini.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Buat kata sandi
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              placeholder=""
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Minimal berisi 8 karakter
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Konfirmasikan kata sandi
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                borderColor:
                  confirmPassword.length > 0 && confirmPassword !== password
                    ? "#ef4444"
                    : colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              secureTextEntry={!showConfirm}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder=""
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={() => setShowConfirm(!showConfirm)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showConfirm ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <Text style={styles.errorText}>Kata sandi tidak cocok</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.checkboxRow}
          activeOpacity={0.8}
          onPress={() => setAgreed(!agreed)}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: agreed ? colors.primary : colors.border,
                backgroundColor: agreed ? colors.primary : "transparent",
              },
            ]}
          >
            {agreed && (
              <Ionicons name="checkmark" size={14} color="#ffffff" />
            )}
          </View>
          <Text
            style={[styles.checkboxText, { color: colors.mutedForeground }]}
          >
            Jika saya kehilangan kata sandi ini, Dompet Digital tidak dapat
            meresetnya.{" "}
            <Text style={{ color: colors.primary }}>
              Pelajari selengkapnya
            </Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: bottomPad + 16, paddingHorizontal: 24 },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: isValid ? "#C8922A" : colors.secondary,
            },
          ]}
          activeOpacity={isValid ? 0.8 : 1}
          disabled={!isValid}
          onPress={handleSubmit}
        >
          <Text
            style={[
              styles.submitButtonText,
              { color: isValid ? "#ffffff" : colors.mutedForeground },
            ]}
          >
            Buat kata sandi
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "4px 4px 10px #D1D5DD, -4px -4px 10px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
    }),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 32,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "inset 4px 4px 10px #D1D5DD, inset -4px -4px 10px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 0 },
    }),
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#ef4444",
    marginTop: 6,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F0F0F3",
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
    ...Platform.select({
      web: { boxShadow: "inset 3px 3px 8px #D1D5DD, inset -3px -3px 8px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: -1, height: -1 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 0 },
    }),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  footer: {
    paddingTop: 16,
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
