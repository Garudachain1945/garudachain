import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { verifyPassword, hasPassword, clearWallet } from "@/utils/wallet-storage";
import { NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT, neoRaisedMd } from "@/constants/neo";

const GARUDA = require("@/assets/images/garuda.png");
const MAX_ATTEMPTS = 5;

export default function UnlockScreen() {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: false }),
    ]).start();
  };

  const handleUnlock = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const pwSet = await hasPassword();
      if (!pwSet) {
        // Belum pernah set password — paksa set password tanpa generate mnemonic baru
        router.replace("/set-password-only");
        return;
      }

      const ok = await verifyPassword(password);
      if (ok) {
        router.replace("/beranda");
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPassword("");
        shake();
        if (newAttempts >= MAX_ATTEMPTS) {
          Alert.alert(
            "Terlalu Banyak Percobaan",
            "Kamu telah salah memasukkan password 5 kali. Gunakan frasa pemulihan untuk reset dompet.",
            [
              { text: "Reset Dompet", style: "destructive", onPress: handleReset },
              { text: "Coba Lagi", onPress: () => setAttempts(0) },
            ]
          );
        } else {
          setError(`Password salah. ${MAX_ATTEMPTS - newAttempts} percobaan tersisa.`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (Platform.OS === "web") {
      const ok = window.confirm(
        "Reset Dompet?\n\nSemua data dompet akan dihapus. Pastikan kamu memiliki frasa pemulihan sebelum melanjutkan."
      );
      if (ok) void clearWallet().then(() => router.replace("/"));
      return;
    }
    Alert.alert(
      "Reset Dompet?",
      "Semua data dompet akan dihapus. Pastikan kamu memiliki frasa pemulihan sebelum melanjutkan.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Hapus",
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NEO_BG }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={[styles.logoCircle, neoRaisedMd]}>
            <Image source={GARUDA} style={styles.logoImg} resizeMode="contain" />
          </View>
          <Text style={styles.appName}>Dompet Digital</Text>
          <Text style={styles.subtitle}>GarudaChain</Text>
        </View>

        {/* Form */}
        <Animated.View style={[styles.formWrap, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.label}>Masukkan Kata Sandi</Text>

          <View style={[styles.inputWrap, neoRaisedMd]}>
            <Ionicons name="lock-closed-outline" size={18} color={NEO_MUTED} />
            <TextInput
              style={styles.input}
              placeholder="Kata sandi dompet"
              placeholderTextColor={NEO_MUTED}
              secureTextEntry={!showPw}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(""); }}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => void handleUnlock()}
            />
            <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color={NEO_MUTED} />
            </TouchableOpacity>
          </View>

          {!!error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.unlockBtn, { opacity: password.trim() ? 1 : 0.5 }]}
            onPress={() => void handleUnlock()}
            disabled={!password.trim() || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.unlockBtnText}>Buka Dompet</Text>
            }
          </TouchableOpacity>
        </Animated.View>

        {/* Reset link */}
        <TouchableOpacity onPress={handleReset} activeOpacity={0.7} style={styles.resetLink}>
          <Text style={styles.resetText}>Lupa kata sandi? Reset dengan frasa pemulihan</Text>
        </TouchableOpacity>

      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28 },
  logoWrap:   { alignItems: "center", gap: 12, paddingTop: 20 },
  logoCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  logoImg:    { width: 64, height: 64, tintColor: NEO_ACCENT },
  appName:    { fontSize: 26, fontFamily: "Inter_700Bold", color: NEO_TEXT, letterSpacing: -0.5 },
  subtitle:   { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },

  formWrap:  { width: "100%", gap: 14 },
  label:     { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, textAlign: "center", marginBottom: 4 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: NEO_BG, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_TEXT, outlineStyle: "none" as any, borderWidth: 0 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", textAlign: "center" },
  unlockBtn: {
    backgroundColor: NEO_ACCENT, borderRadius: 16,
    paddingVertical: 16, alignItems: "center",
  },
  unlockBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  resetLink: { paddingVertical: 8 },
  resetText: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", textDecorationLine: "underline" },
});
