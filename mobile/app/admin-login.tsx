import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  neoAccentBtn,
} from "@/constants/neo";

const ADMIN_CREDENTIALS = [
  { username: "admin", password: "admin123", name: "Admin GarudaChain" },
  { username: "cs1", password: "cs2024!", name: "CS Andi" },
  { username: "cs2", password: "cs2024@", name: "CS Rina" },
];

export default function AdminLoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userErr, setUserErr] = useState(false);
  const [passErr, setPassErr] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: false }),
    ]).start();
  };

  const pressIn = () =>
    Animated.spring(pressAnim, { toValue: 0.96, useNativeDriver: false }).start();
  const pressOut = () =>
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: false }).start();

  const handleLogin = () => {
    setUserErr(false);
    setPassErr(false);

    const trimUser = username.trim();
    const trimPass = password.trim();

    if (!trimUser) { setUserErr(true); shake(); return; }
    if (!trimPass) { setPassErr(true); shake(); return; }

    setLoading(true);

    setTimeout(() => {
      const match = ADMIN_CREDENTIALS.find(
        (c) => c.username === trimUser && c.password === trimPass
      );
      setLoading(false);

      if (match) {
        router.push({
          pathname: "/admin-obrolan",
          params: { adminName: match.name, adminUser: match.username },
        });
      } else {
        setUserErr(true);
        setPassErr(true);
        shake();
        Alert.alert(
          "Login Gagal",
          "Username atau sandi tidak sesuai. Hubungi administrator sistem jika lupa kredensial.",
          [{ text: "Coba Lagi", style: "cancel" }]
        );
      }
    }, 900);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NEO_BG }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={[s.backBtn, neoRaisedMd]} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={NEO_TEXT} />
        </TouchableOpacity>

        {/* Logo & title */}
        <View style={s.logoWrap}>
          <View style={[s.logoCircle, neoRaisedMd]}>
            <Ionicons name="shield-checkmark" size={40} color={NEO_ACCENT} />
          </View>
          <Text style={s.appName}>GarudaChain</Text>
          <View style={s.adminBadge}>
            <Ionicons name="settings" size={12} color="#fff" />
            <Text style={s.adminBadgeText}>PANEL ADMIN</Text>
          </View>
          <Text style={s.subtitle}>
            Masuk sebagai admin untuk mengelola dan membalas chat pelanggan P2P.
          </Text>
        </View>

        {/* Form card */}
        <Animated.View style={[s.formCard, neoRaisedMd, { transform: [{ translateX: shakeAnim }] }]}>
          {/* Username */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Username Admin</Text>
            <View style={[s.inputWrap, neoInset, userErr && s.inputError]}>
              <Ionicons name="person-outline" size={18} color={userErr ? "#EF4444" : NEO_MUTED} />
              <TextInput
                style={s.input}
                placeholder="Masukkan username"
                placeholderTextColor={NEO_MUTED}
                value={username}
                onChangeText={(t) => { setUsername(t); setUserErr(false); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {userErr && (
              <Text style={s.errorHint}>
                <Ionicons name="alert-circle" size={11} color="#EF4444" /> Username tidak valid
              </Text>
            )}
          </View>

          {/* Password */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Sandi</Text>
            <View style={[s.inputWrap, neoInset, passErr && s.inputError]}>
              <Ionicons name="lock-closed-outline" size={18} color={passErr ? "#EF4444" : NEO_MUTED} />
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Masukkan sandi"
                placeholderTextColor={NEO_MUTED}
                value={password}
                onChangeText={(t) => { setPassword(t); setPassErr(false); }}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPass((p) => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={18} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>
            {passErr && (
              <Text style={s.errorHint}>
                <Ionicons name="alert-circle" size={11} color="#EF4444" /> Sandi tidak valid
              </Text>
            )}
          </View>

          {/* Login button */}
          <Animated.View style={{ transform: [{ scale: pressAnim }], marginTop: 8 }}>
            <TouchableOpacity
              style={[s.loginBtn, neoAccentBtn, loading && { opacity: 0.8 }]}
              onPress={handleLogin}
              onPressIn={pressIn}
              onPressOut={pressOut}
              activeOpacity={1}
              disabled={loading}
            >
              {loading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="sync" size={18} color="#fff" />
                  <Text style={s.loginBtnText}>Memverifikasi...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                  <Text style={s.loginBtnText}>Masuk ke Panel Admin</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Info box */}
        <View style={[s.infoBox, neoRaisedMd]}>
          <Ionicons name="information-circle-outline" size={18} color={NEO_ACCENT} />
          <Text style={s.infoText}>
            Halaman ini hanya untuk tim GarudaChain. Jika Anda pelanggan, silakan kembali ke halaman utama.
          </Text>
        </View>

        {/* Demo hint */}
        <View style={s.demoHint}>
          <Text style={s.demoHintText}>Demo: username <Text style={{ color: NEO_ACCENT }}>admin</Text> · sandi <Text style={{ color: NEO_ACCENT }}>admin123</Text></Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    backgroundColor: NEO_BG,
    gap: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: NEO_TEXT,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: NEO_ACCENT,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  adminBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: NEO_MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  formCard: {
    backgroundColor: NEO_BG,
    borderRadius: 24,
    padding: 24,
    gap: 18,
  },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: NEO_TEXT,
    marginLeft: 4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#EF444440",
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: NEO_TEXT,
  },
  errorHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    marginLeft: 4,
  },
  loginBtn: {
    backgroundColor: NEO_ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    padding: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: NEO_MUTED,
    lineHeight: 18,
  },
  demoHint: {
    alignItems: "center",
  },
  demoHintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: NEO_MUTED,
  },
});
