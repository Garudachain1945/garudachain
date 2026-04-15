import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useWalletSetup } from "@/context/WalletSetupContext";
import { deriveKey, deriveQuantumKey } from "@/utils/wallet-crypto";
import { saveWallet, savePasswordHash, saveQuantumAddress } from "@/utils/wallet-storage";

const GARUDA = require("@/assets/images/garuda.png");

export default function DompetSiapScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const { mnemonic, password, clear } = useWalletSetup();
  const [saving, setSaving] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: false }),
    ]).start();
  }, []);

  async function handleOpen() {
    if (saving) return;
    setSaving(true);
    try {
      const key = await deriveKey(mnemonic, 0);
      const qkey = await deriveQuantumKey(mnemonic, 0);
      await saveWallet(mnemonic, {
        id: "account-0",
        name: "Akun 1",
        address: key.address,
        publicKey: key.publicKeyHex,
        accountIndex: 0,
        quantumAddress: qkey.address,
      });
      await saveQuantumAddress(qkey.address);
      if (password) await savePasswordHash(password);
      clear();
      router.replace("/beranda");
    } catch (e) {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.illustrationArea}>
        <Animated.View style={[styles.illustrationWrapper, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Image
            source={GARUDA}
            style={styles.garudaImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <Animated.View style={[styles.textArea, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Dompet Anda{"\n"}sudah siap!</Text>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        <TouchableOpacity
          style={styles.openButton}
          activeOpacity={0.85}
          onPress={handleOpen}
          disabled={saving}
        >
          <Text style={styles.openButtonText}>Buka dompet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F0F3",
  },
  illustrationArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationWrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "8px 8px 20px #D1D5DD, -8px -8px 20px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 6, height: 6 }, shadowOpacity: 0.9, shadowRadius: 12, elevation: 8 },
    }),
  },
  garudaImage: {
    width: 150,
    height: 150,
    tintColor: "#C8922A",
  },
  textArea: {
    paddingHorizontal: 28,
    paddingBottom: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#2D3748",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  footer: {
    paddingTop: 8,
  },
  openButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#C8922A",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "4px 4px 10px #B07820, -2px -2px 6px #E0A840" } as any,
      default: { shadowColor: "#B07820", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
    }),
  },
  openButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
});
