import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function IzinPenggunaanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [gatherData, setGatherData] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Bantu Tingkatkan{"\n"}GarudaChain
        </Text>

        <View style={styles.illustration}>
          <View style={[styles.platform, { backgroundColor: colors.card, borderColor: colors.border }]} />
          <View style={styles.iconsRow}>
            <View style={[styles.iconBubble, { backgroundColor: "#FFF3DC", borderColor: "#F0C040" }]}>
              <Ionicons name="wallet-outline" size={26} color={colors.primary} />
            </View>
            <View style={[styles.iconBubbleCenter, { backgroundColor: "#C8922A" }]}>
              <Ionicons name="shield-checkmark" size={32} color="#ffffff" />
            </View>
            <View style={[styles.iconBubble, { backgroundColor: "#EEF2FF", borderColor: "#A5B4FC" }]}>
              <Ionicons name="analytics-outline" size={26} color="#6366F1" />
            </View>
          </View>
        </View>

        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Kami ingin meminta izin ini. Anda dapat memilih keluar atau menghapus data penggunaan Anda kapan saja.
        </Text>

        <TouchableOpacity
          style={[
            styles.optionCard,
            {
              backgroundColor: colors.card,
              borderColor: gatherData ? colors.primary : colors.border,
            },
          ]}
          activeOpacity={0.8}
          onPress={() => setGatherData(!gatherData)}
        >
          <View style={styles.optionRow}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: gatherData ? colors.primary : colors.border,
                  backgroundColor: gatherData ? colors.primary : "transparent",
                },
              ]}
            >
              {gatherData && (
                <Ionicons name="checkmark" size={14} color="#ffffff" />
              )}
            </View>
            <Text style={[styles.optionTitle, { color: colors.foreground }]}>
              Kumpulkan data penggunaan dasar
            </Text>
          </View>
          <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
            Kami akan mengumpulkan data penggunaan produk dasar. Kami mungkin
            mengaitkan informasi ini dengan data on-chain.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.optionCard,
            {
              backgroundColor: colors.card,
              borderColor: productUpdates ? colors.primary : colors.border,
            },
          ]}
          activeOpacity={0.8}
          onPress={() => setProductUpdates(!productUpdates)}
        >
          <View style={styles.optionRow}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: productUpdates ? colors.primary : colors.border,
                  backgroundColor: productUpdates ? colors.primary : "transparent",
                },
              ]}
            >
              {productUpdates && (
                <Ionicons name="checkmark" size={14} color="#ffffff" />
              )}
            </View>
            <Text style={[styles.optionTitle, { color: colors.foreground }]}>
              Pembaruan produk
            </Text>
          </View>
          <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
            Kami akan menggunakan data ini untuk mempelajari cara Anda
            berinteraksi dengan komunikasi kami. Kami mungkin berbagi berita
            relevan (seperti fitur produk).
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: "#C8922A" }]}
          activeOpacity={0.8}
          onPress={() => router.push("/dompet-siap")}
        >
          <Text style={styles.continueButtonText}>Lanjutkan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: 32,
  },
  illustration: {
    alignItems: "center",
    marginBottom: 32,
    height: 110,
    justifyContent: "flex-end",
  },
  platform: {
    position: "absolute",
    bottom: 0,
    width: 220,
    height: 22,
    borderRadius: 50,
    borderWidth: 1,
    opacity: 0.5,
  },
  iconsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 16,
    marginBottom: 12,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  iconBubbleCenter: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 24,
  },
  optionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "6px 6px 14px #D1D5DD, -6px -6px 14px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 5 },
    }),
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  optionDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    paddingLeft: 34,
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
    color: "#ffffff",
  },
});
