import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Share,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoRaisedSm, neoAccentBtn,
} from "@/constants/neo";
import { getActiveAccount } from "@/utils/wallet-storage";
import { generateQR } from "@/utils/qrcode";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function QRCode({ size = 200, value = "" }: { size?: number; value?: string }) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try { return generateQR(value); } catch { return null; }
  }, [value]);

  if (!matrix) {
    return <View style={{ width: size, height: size, backgroundColor: "#ffffff", borderRadius: 10 }} />;
  }

  const modules = matrix.length;
  const quiet = 4; // 4-module quiet zone each side
  const cell = size / (modules + quiet * 2);
  const offset = quiet * cell;

  const rects: React.ReactElement[] = [];
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (matrix[r][c]) {
        rects.push(
          <Rect
            key={`${r}-${c}`}
            x={offset + c * cell}
            y={offset + r * cell}
            width={cell}
            height={cell}
            fill="#000000"
          />
        );
      }
    }
  }

  return (
    <Svg width={size} height={size} style={{ backgroundColor: "#ffffff", borderRadius: 10 }}>
      {rects}
    </Svg>
  );
}

export default function TerimaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletName, setWalletName] = useState("Akun 1");
  const [loading, setLoading] = useState(true);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    void (async () => {
      const account = await getActiveAccount();
      if (account) {
        setWalletAddress(account.address);
        setWalletName(account.name);
      }
      setLoading(false);
    })();
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await Share.share({
      message: `Alamat GarudaChain saya:\n${walletAddress}`,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backBtn, neoRaisedMd]}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={"arrow-back" as IoniconName} size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terima Aset</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Asset badge */}
        <View style={[styles.assetBadgeWrap, neoRaisedMd]}>
          <View style={[styles.assetIcon, { backgroundColor: "#C8922A22" }]}>
            <Text style={[styles.assetLetter, { color: "#C8922A" }]}>G</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.assetName}>GarudaChain</Text>
            <Text style={styles.assetNetwork}>Jaringan GarudaChain · GRD · Stablecoin · Saham</Text>
          </View>
          <View style={styles.networkBadge}>
            <Text style={styles.networkBadgeText}>Mainnet</Text>
          </View>
        </View>

        {/* QR card */}
        <View style={[styles.qrCard, neoRaisedMd]}>
          <View style={[styles.qrWrapper, neoRaisedSm]}>
            <QRCode size={180} value={walletAddress} />
          </View>
          <Text style={styles.qrHint}>
            {loading ? "Memuat alamat..." : `Pindai untuk menerima aset GarudaChain · ${walletName}`}
          </Text>
        </View>

        {/* Address */}
        <View style={[styles.addressCard, neoRaisedMd]}>
          <Text style={styles.addressLabel}>Alamat GarudaChain</Text>
          <Text style={styles.addressText} selectable>
            {loading ? "Memuat..." : walletAddress}
          </Text>
        </View>

        <View style={styles.actionBtns}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.copyBtn, neoAccentBtn, copied && styles.copyBtnDone]}
            onPress={handleCopy}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Ionicons name={(copied ? "checkmark-circle" : "copy-outline") as IoniconName} size={18} color="#ffffff" />
            <Text style={styles.actionBtnText}>{copied ? "Tersalin!" : "Salin Alamat"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.shareBtn, neoRaisedMd]}
            activeOpacity={0.85}
            onPress={handleShare}
            disabled={loading}
          >
            <Ionicons name={"share-outline" as IoniconName} size={18} color={NEO_TEXT} />
            <Text style={[styles.actionBtnText, { color: NEO_TEXT }]}>Bagikan</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.warningCard, neoRaisedMd, { backgroundColor: "#FEF9EE" }]}>
          <Ionicons name={"warning-outline" as IoniconName} size={18} color="#F59E0B" style={{ marginTop: 1 }} />
          <Text style={styles.warningText}>
            Alamat ini menerima <Text style={styles.warningBold}>GRD, Stablecoin, dan Saham</Text> di
            jaringan <Text style={styles.warningBold}>GarudaChain</Text>.
            Pastikan pengirim menggunakan jaringan GarudaChain.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  assetBadgeWrap: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: NEO_BG, borderRadius: 16, padding: 14,
  },
  assetIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  assetLetter: { fontSize: 20, fontFamily: "Inter_700Bold" },
  assetName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  assetNetwork: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 2 },
  networkBadge: { backgroundColor: "#C8922A22", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  networkBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#C8922A" },
  qrCard: { backgroundColor: NEO_BG, borderRadius: 20, padding: 24, alignItems: "center" },
  qrWrapper: { padding: 12, backgroundColor: "#ffffff", borderRadius: 16, marginBottom: 16 },
  qrHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },
  addressCard: { backgroundColor: NEO_BG, borderRadius: 16, padding: 16 },
  addressLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  addressText: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_TEXT, letterSpacing: 0.3, lineHeight: 20 },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14 },
  copyBtn: { backgroundColor: NEO_ACCENT },
  copyBtnDone: { backgroundColor: "#22C55E" },
  shareBtn: { backgroundColor: NEO_BG },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#ffffff" },
  warningCard: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 14 },
  warningText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#92400E", lineHeight: 19 },
  warningBold: { fontFamily: "Inter_600SemiBold" },
});
