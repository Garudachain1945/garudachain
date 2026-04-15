import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  NEO_BG,
  NEO_TEXT,
  NEO_MUTED,
  NEO_ACCENT,
  neoRaisedSm,
  neoInset,
  neoAccentBtn,
} from "@/constants/neo";
import { loadWallet, addAccount, setActiveAccount } from "@/utils/wallet-storage";
import { deriveKey } from "@/utils/wallet-crypto";

export default function BuatAkunScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [existingCount, setExistingCount] = useState(1);
  const [name, setName] = useState("Akun 2");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const wallet = await loadWallet();
      if (wallet) {
        const count = wallet.accounts.length;
        setExistingCount(count);
        setName(`Akun ${count + 1}`);
      }
    })();
  }, []);

  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Nama Diperlukan", "Masukkan nama untuk akun ini.");
      return;
    }
    setLoading(true);
    try {
      const wallet = await loadWallet();
      if (!wallet) {
        Alert.alert("Error", "Dompet tidak ditemukan. Buat dompet terlebih dahulu.");
        return;
      }
      const accountIndex = wallet.accounts.length;
      const derived = await deriveKey(wallet.mnemonic, accountIndex);
      const newAccount = {
        id: `account-${accountIndex}`,
        name: name.trim(),
        address: derived.address,
        publicKey: derived.publicKeyHex,
        accountIndex,
      };
      await addAccount(newAccount);
      await setActiveAccount(newAccount.id);
      Alert.alert("Berhasil", `Akun "${newAccount.name}" berhasil dibuat.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Gagal", "Terjadi kesalahan saat membuat akun. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={NEO_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buat Akun</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, neoRaisedSm]}>
            <Text style={styles.avatarText}>{initials || "A"}</Text>
          </View>
          <View style={[styles.editBadge, neoRaisedSm]}>
            <Ionicons name="pencil" size={12} color={NEO_ACCENT} />
          </View>
        </View>

        <Text style={styles.avatarHint}>Nama Akun</Text>

        {/* Name input */}
        <View style={[styles.inputWrap, neoInset]}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Masukkan nama akun"
            placeholderTextColor={NEO_MUTED}
            maxLength={30}
            returnKeyType="done"
          />
          {name.length > 0 && (
            <TouchableOpacity
              onPress={() => setName("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={NEO_MUTED} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.hint}>
          Nama ini hanya terlihat oleh Anda dan dapat diubah kapan saja.
        </Text>

        <View style={[styles.infoCard, { marginTop: 20 }]}>
          <Ionicons name="information-circle-outline" size={16} color={NEO_ACCENT} />
          <Text style={styles.infoText}>
            Akun baru akan diturunkan dari frasa pemulihan yang sama (akun ke-{existingCount + 1}).
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
        <TouchableOpacity
          style={[styles.cancelBtn, neoRaisedSm]}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <Text style={styles.cancelBtnText}>Batal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.createBtn, neoAccentBtn, loading && { opacity: 0.6 }]}
          onPress={() => void handleCreate()}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Buat</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NEO_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: NEO_TEXT,
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  avatarWrap: {
    marginBottom: 24,
    position: "relative",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: NEO_ACCENT,
    letterSpacing: -1,
  },
  editBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHint: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: NEO_MUTED,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "web" ? 14 : 12,
    width: "100%",
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: NEO_TEXT,
    outlineStyle: "none",
  } as any,
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: NEO_MUTED,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: NEO_ACCENT + "12",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: NEO_ACCENT + "30",
    width: "100%",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: NEO_TEXT,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  cancelBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: NEO_MUTED,
  },
  createBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
