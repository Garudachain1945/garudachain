import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useWalletSetup } from "@/context/WalletSetupContext";

export default function FrasaPemulihanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mnemonic } = useWalletSetup();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const words = mnemonic ? mnemonic.split(" ") : Array(24).fill("...");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
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
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Simpan Frasa Pemulihan{"\n"}Rahasia
        </Text>

        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {"Anda "}
          <Text
            style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}
            onPress={() => setShowInfo(true)}
          >
            Frasa Pemulihan Rahasia
          </Text>
          {" memberikan akses dompet sepenuhnya. Catat dengan urutan dan nomor yang benar.\nSimpan dengan aman dan jangan pernah dibagikan."}
        </Text>

        <View style={[styles.gridWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.wordsGrid}>
            {words.map((word: string, index: number) => (
              <View
                key={index}
                style={[styles.wordCell, { borderColor: colors.border }]}
              >
                <Text style={[styles.wordNumber, { color: colors.mutedForeground }]}>
                  {index + 1}.
                </Text>
                <Text style={[styles.wordText, { color: colors.foreground }]}>
                  {word}
                </Text>
              </View>
            ))}
          </View>

          {!revealed && (
            <TouchableOpacity
              style={styles.blurOverlay}
              activeOpacity={0.9}
              onPress={() => setRevealed(true)}
            >
              <View style={styles.blurContent}>
                <Ionicons name="eye-off-outline" size={28} color={colors.foreground} />
                <Text style={[styles.tapRevealText, { color: colors.foreground }]}>
                  Ketuk untuk melihat
                </Text>
                <Text style={[styles.tapRevealSub, { color: colors.mutedForeground }]}>
                  Pastikan tidak ada yang melihat layar Anda.
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {revealed && (
          <TouchableOpacity
            style={[
              styles.copyButton,
              {
                borderColor: copied ? colors.primary : colors.border,
                backgroundColor: copied ? "#FFF8E7" : colors.card,
              },
            ]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Ionicons
              name={copied ? "checkmark-done-outline" : "copy-outline"}
              size={18}
              color={copied ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.copyText, { color: copied ? colors.primary : colors.mutedForeground }]}>
              {copied ? "Tersalin!" : "Salin ke papan klip"}
            </Text>
          </TouchableOpacity>
        )}

        <View style={[styles.warningBox, { backgroundColor: "#FFF8E7", borderColor: "#F0C040" }]}>
          <Ionicons name="warning-outline" size={18} color="#C8922A" style={{ marginTop: 1 }} />
          <Text style={[styles.warningText, { color: "#7A5A00" }]}>
            Jangan pernah bagikan frasa ini kepada siapapun. Siapapun yang memiliki frasa ini
            dapat mengakses seluruh aset Anda.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: revealed ? "#C8922A" : colors.secondary },
          ]}
          activeOpacity={revealed ? 0.8 : 1}
          disabled={!revealed}
          onPress={() => revealed && router.push("/verifikasi-frasa")}
        >
          <Text style={[styles.continueButtonText, { color: revealed ? "#ffffff" : colors.mutedForeground }]}>
            Lanjutkan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.remindLaterButton} activeOpacity={0.7}>
          <Text style={[styles.remindLaterText, { color: colors.primary }]}>
            Ingatkan saya nanti
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInfo(false)}
        >
          <View style={styles.modalCenteredWrapper}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={[styles.infoSheet, { backgroundColor: colors.background }]}>
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
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
    lineHeight: 34,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 24,
  },
  gridWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "6px 6px 14px #D1D5DD, -6px -6px 14px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6 },
    }),
  },
  wordsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  wordCell: {
    width: "33.33%",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    gap: 4,
  },
  wordNumber: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    minWidth: 22,
  },
  wordText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(240,240,240,0.85)",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(12px)",
  } as any,
  blurContent: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  tapRevealText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  tapRevealSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  copyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  warningBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 16,
    gap: 12,
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
  remindLaterButton: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  remindLaterText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCenteredWrapper: {
    width: "100%",
    maxWidth: 420,
  },
  infoSheet: {
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
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
