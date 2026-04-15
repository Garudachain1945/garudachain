import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { validateMnemonic, deriveKey, deriveQuantumKey } from "@/utils/wallet-crypto";
import { saveWallet, saveQuantumAddress } from "@/utils/wallet-storage";

export default function ImporDompetScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [phrase, setPhrase] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const wordCount = phrase.trim() === "" ? 0 : phrase.trim().split(/\s+/).length;
  const isValid = wordCount === 24 && validateMnemonic(phrase.trim());

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setPhrase(text);
    } catch {}
  };

  const handleImport = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError("");
    try {
      const key = await deriveKey(phrase.trim(), 0);
      const qkey = await deriveQuantumKey(phrase.trim(), 0);
      await saveWallet(phrase.trim(), {
        id: "account-0",
        name: "Akun 1",
        address: key.address,
        publicKey: key.publicKeyHex,
        accountIndex: 0,
        quantumAddress: qkey.address,
      });
      await saveQuantumAddress(qkey.address);
      router.replace("/set-password-only");
    } catch (e) {
      setError("Gagal mengimpor dompet. Periksa frasa pemulihan.");
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="qr-code-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Impor dompet
        </Text>

        <View style={styles.subtitleRow}>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Masukkan Frasa Pemulihan Rahasia
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={() => setShowInfo(true)}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.textAreaWrapper,
            {
              backgroundColor: colors.card,
              borderColor: phrase.length > 0 ? colors.primary : colors.border,
            },
          ]}
        >
          <TextInput
            style={[styles.textArea, { color: colors.foreground }]}
            multiline
            value={phrase}
            onChangeText={setPhrase}
            placeholder="Tambahkan spasi di antara setiap kata dan pastikan tidak ada yang melihat."
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            secureTextEntry={false}
          />

          <TouchableOpacity
            style={styles.pasteButton}
            onPress={handlePaste}
            activeOpacity={0.7}
          >
            <Text style={[styles.pasteText, { color: colors.primary }]}>
              Tempel
            </Text>
          </TouchableOpacity>
        </View>

        {phrase.trim().length > 0 && (
          <Text
            style={[
              styles.wordCountText,
              { color: isValid ? colors.primary : colors.mutedForeground },
            ]}
          >
            {wordCount} dari 24 kata
          </Text>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        {error ? (
          <Text style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 10 }}>{error}</Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: isValid && !loading ? "#C8922A" : colors.secondary },
          ]}
          activeOpacity={isValid ? 0.8 : 1}
          disabled={!isValid || loading}
          onPress={handleImport}
        >
          <Text
            style={[
              styles.continueButtonText,
              { color: isValid && !loading ? "#ffffff" : colors.mutedForeground },
            ]}
          >
            {loading ? "Mengimpor..." : "Lanjutkan"}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInfo(false)}
        />
        <View style={[styles.infoSheet, { backgroundColor: colors.background, paddingBottom: bottomPad + 16 }]}>
          <View style={styles.infoHeader}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>
              Apa itu Frasa Pemulihan Rahasia?
            </Text>
            <TouchableOpacity
              onPress={() => setShowInfo(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.infoScroll}>
            <Text style={[styles.infoBody, { color: colors.foreground }]}>
              Frasa Pemulihan Rahasia, yang juga disebut seed phrase atau mnemonic, merupakan serangkaian kata yang memungkinkan Anda untuk mengakses dan mengendalikan dompet kripto. Untuk memindahkan dompet ke Dompet Digital, Anda memerlukan frasa ini.
            </Text>

            <Text style={[styles.infoBody, { color: colors.foreground, marginTop: 16 }]}>
              Siapa pun yang memiliki Frasa Pemulihan Rahasia milik Anda dapat:
            </Text>

            {[
              "Mengambil semua uang Anda",
              "Mengonfirmasikan transaksi",
              "Mengubah informasi login Anda",
            ].map((item) => (
              <View key={item} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: colors.foreground }]}>{"\u2022"}</Text>
                <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.infoButton, { backgroundColor: "#C8922A" }]}
            activeOpacity={0.8}
            onPress={() => setShowInfo(false)}
          >
            <Text style={styles.infoButtonText}>Mengerti</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textAreaWrapper: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    minHeight: 160,
  },
  textArea: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    minHeight: 100,
  },
  pasteButton: {
    alignSelf: "flex-end",
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  pasteText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  wordCountText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 10,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 16,
  },
  continueButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  infoSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    maxHeight: "70%",
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    flex: 1,
    lineHeight: 26,
  },
  infoScroll: {
    marginBottom: 24,
  },
  infoBody: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: "Inter_400Regular",
  },
  bulletText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    flex: 1,
  },
  infoButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  infoButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
});
