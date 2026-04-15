import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { createOrder, nowTime, getMyListings, type P2POrder, type P2PMyListing } from "@/utils/p2p-storage";
import {
  NEO_BG,
  NEO_TEXT,
  NEO_MUTED,
  NEO_ACCENT,
  neoRaisedMd,
  neoBottom,
} from "@/constants/neo";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const EWALLET = ["GoPay", "OVO", "DANA", "ShopeePay", "LinkAja"];

const formatNum = (n: number, decimals = 2) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function P2POrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [listing, setListing] = useState<P2PMyListing | null>(null);

  useEffect(() => {
    void (async () => {
      const all = await getMyListings();
      const found = all.find((l) => l.id === id);
      if (found) setListing(found);
    })();
  }, [id]);

  const [inputMode, setInputMode] = useState<"idr" | "asset">("idr");
  const [inputValue, setInputValue] = useState("");
  const [selectedPayIdx, setSelectedPayIdx] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Loading state — listing belum diambil dari AsyncStorage
  if (!listing) {
    return (
      <View style={{ flex: 1, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Ionicons name="hourglass-outline" size={40} color={NEO_MUTED} />
        <Text style={{ color: NEO_MUTED, fontFamily: "Inter_400Regular", fontSize: 14 }}>Memuat iklan...</Text>
      </View>
    );
  }

  /* Semua field P2PMyListing sudah aman diakses di bawah ini */
  const userBuying = listing.type === "jual"; // P2PMyListing pakai "type", bukan "side"
  const actionLabel = userBuying ? "Beli" : "Jual";
  const actionColor = userBuying ? "#22C55E" : "#EF4444";

  const priceNum = listing.priceNum;
  const balance = 0; // saldo aktual akan diintegrasikan dari wallet storage
  const limitMinAsset = priceNum > 0 ? listing.limitMin / priceNum : 0;
  const limitMaxAsset = priceNum > 0 ? listing.limitMax / priceNum : 0;

  const rawValue = parseFloat(inputValue.replace(/\./g, "").replace(",", ".")) || 0;

  let idrAmount = 0;
  let assetAmount = 0;
  if (inputMode === "idr") {
    idrAmount = rawValue;
    assetAmount = priceNum > 0 ? rawValue / priceNum : 0;
  } else {
    assetAmount = rawValue;
    idrAmount = rawValue * priceNum;
  }

  const isValid =
    rawValue > 0 &&
    (inputMode === "idr"
      ? idrAmount >= listing.limitMin && idrAmount <= listing.limitMax
      : assetAmount >= limitMinAsset && assetAmount <= limitMaxAsset);

  const selectedPay = listing.payments[selectedPayIdx] ?? listing.payments[0];

  const handleMaks = () => {
    const maxIdr = listing.limitMax;
    const maxAsset = Math.min(balance, limitMaxAsset);
    if (inputMode === "idr") {
      setInputValue(maxIdr.toLocaleString("id-ID"));
    } else {
      setInputValue(maxAsset.toFixed(4));
    }
  };

  const handleSemua = () => {
    setInputValue(balance.toFixed(4));
  };

  const handlePasangOrder = async () => {
    if (!isValid) {
      Alert.alert("Jumlah Tidak Valid", "Masukkan jumlah antara batas minimum dan maksimum.");
      return;
    }

    const myRole = userBuying ? "buyer" : "seller";
    const orderId = `ord_${Date.now()}`;
    const t = nowTime();

    const idrFmt = `Rp ${Math.round(idrAmount).toLocaleString("id-ID")}`;

    const initMessages: P2POrder["messages"] = [
      {
        id: `sys-escrow-${Date.now()}`,
        from: "system",
        text: `🔒 ESCROW AKTIF: ${assetAmount.toFixed(4)} ${listing.asset} dikunci dalam escrow GarudaChain. Dana aman terlindungi hingga transaksi selesai.`,
        time: t,
        timestamp: new Date().toISOString(),
        isEscrow: true,
      },
      {
        id: `sys-info-${Date.now() + 1}`,
        from: "system",
        text: userBuying
          ? `📋 Order #${orderId.slice(-6).toUpperCase()} dibuat.\n\nSilakan transfer ${idrFmt} via ${selectedPay.method} ke:\n🏦 ${selectedPay.method}\n📋 ${selectedPay.noRek}\n👤 ${selectedPay.nama}\n\n⚠️ Kosongkan kolom berita/catatan transfer.`
          : `📋 Order #${orderId.slice(-6).toUpperCase()} dibuat. Tunggu konfirmasi pembayaran IDR ${idrFmt} ke rekening kamu dari Admin.`,
        time: t,
        timestamp: new Date().toISOString(),
        isEscrow: false,
      },
    ];

    const order: P2POrder = {
      id: orderId,
      listingId: listing.id,
      myRole,
      traderName: "Admin",
      asset: listing.asset,
      assetAmount: parseFloat(assetAmount.toFixed(4)),
      idrAmount: Math.round(idrAmount),
      priceNum: listing.priceNum,
      paymentMethod: selectedPay.method,
      paymentNoRek: selectedPay.noRek,
      paymentNama: selectedPay.nama,
      status: "menunggu",
      createdAt: new Date().toISOString(),
      paidAt: null,
      releasedAt: null,
      autoReleaseAt: null,
      messages: initMessages,
    };

    await createOrder(order);

    router.push({
      pathname: "/p2p-chat",
      params: { orderId },
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NEO_BG }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[s.backBtn, neoRaisedMd]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.assetIcon, { backgroundColor: actionColor + "22" }]}>
            <Text style={[s.assetIconText, { color: actionColor }]}>{listing.asset[0]}</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>{actionLabel} {listing.asset}</Text>
            {!userBuying && (
              <View style={s.priceSubRow}>
                <Text style={s.priceSubText}>Harga Rp{priceNum.toLocaleString("id-ID")}</Text>
                <Ionicons name="refresh-outline" size={13} color={NEO_MUTED} />
              </View>
            )}
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tab: Berdasarkan IDR / USDT ── */}
        <View style={[s.tabCard, neoRaisedMd]}>
          <View style={s.modeTabBar}>
            <TouchableOpacity
              style={s.modeTab}
              onPress={() => { setInputMode("idr"); setInputValue(""); }}
              activeOpacity={0.85}
            >
              <Text style={[s.modeTabText, inputMode === "idr" && s.modeTabTextActive]}>
                Berdasarkan IDR
              </Text>
              {inputMode === "idr" && <View style={s.modeTabIndicator} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.modeTab}
              onPress={() => { setInputMode("asset"); setInputValue(""); }}
              activeOpacity={0.85}
            >
              <Text style={[s.modeTabText, inputMode === "asset" && s.modeTabTextActive]}>
                Berdasarkan {listing.asset}
              </Text>
              {inputMode === "asset" && <View style={s.modeTabIndicator} />}
            </TouchableOpacity>
          </View>

          {/* Amount input */}
          <View style={s.amountRow}>
            <TextInput
              style={s.amountInput}
              placeholder="0"
              placeholderTextColor={NEO_MUTED}
              keyboardType="decimal-pad"
              value={inputValue}
              onChangeText={setInputValue}
            />
            <View style={s.amountRight}>
              <Text style={s.amountUnit}>
                {inputMode === "idr" ? "IDR" : listing.asset}
              </Text>
              <TouchableOpacity onPress={inputMode === "idr" ? handleMaks : handleSemua}>
                <Text style={s.maksBtn}>
                  {inputMode === "idr" ? "Maks." : "Semua"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Limit text */}
          <Text style={s.limitText}>
            {"Limit  "}
            {inputMode === "idr"
              ? `${formatNum(listing.limitMin, 0)} – ${formatNum(listing.limitMax, 0)} IDR`
              : `${formatNum(limitMinAsset, 2)} – ${formatNum(limitMaxAsset, 2)} ${listing.asset}`}
          </Text>

          {/* Balance (jual mode only) */}
          {!userBuying && (
            <View style={s.balanceRow}>
              <Text style={s.balanceText}>Saldo {formatNum(balance, 4)} {listing.asset}</Text>
              <Ionicons name="add-circle-outline" size={15} color={NEO_MUTED} />
            </View>
          )}

          {/* Anda Menerima */}
          <View style={s.terimaSep} />
          <View style={s.terimaRow}>
            <Text style={s.terimaLabel}>Anda Menerima</Text>
            <Text style={s.terimaValue}>
              {userBuying
                ? `${assetAmount > 0 ? formatNum(assetAmount, 4) : "0"} ${listing.asset}`
                : `${idrAmount > 0 ? formatNum(idrAmount, 0) : "0"} IDR`}
            </Text>
          </View>
        </View>

        {/* ── Payment Card (Binance-style) ── */}
        <View style={[s.payCard, neoRaisedMd]}>
          <View style={s.payCardHeader}>
            <Text style={s.payCardTitle}>
              {userBuying ? "Rekening Tujuan Pembayaran" : "Rekening Pembayaran Saya"}
            </Text>
            {/* Selector metode jika lebih dari 1 */}
            {listing.payments.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {listing.payments.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.methodTab, selectedPayIdx === i && s.methodTabActive]}
                      onPress={() => setSelectedPayIdx(i)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={(EWALLET.includes(p.method) ? "phone-portrait-outline" : "card-outline") as IoniconName}
                        size={13}
                        color={selectedPayIdx === i ? "#fff" : NEO_MUTED}
                      />
                      <Text style={[s.methodTabText, selectedPayIdx === i && s.methodTabTextActive]}>
                        {p.method}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Detail rekening */}
          <View style={s.payDetail}>
            {/* Nama Bank / E-Wallet */}
            <View style={s.payDetailRow}>
              <View style={[s.payMethodIcon, { backgroundColor: actionColor + "18" }]}>
                <Ionicons
                  name={(EWALLET.includes(selectedPay.method) ? "phone-portrait" : "card") as IoniconName}
                  size={16}
                  color={actionColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.payDetailLabel}>Bank / E-Wallet</Text>
                <Text style={s.payDetailValue}>{selectedPay.method}</Text>
              </View>
            </View>

            {/* Nomor Rekening */}
            <View style={[s.payDetailRow, { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)", paddingTop: 12 }]}>
              <View style={[s.payMethodIcon, { backgroundColor: "#3B82F618" }]}>
                <Ionicons name="keypad-outline" size={16} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.payDetailLabel}>Nomor Rekening</Text>
                <Text style={s.payDetailValueLarge}>{selectedPay.noRek}</Text>
              </View>
              <TouchableOpacity
                style={[s.copyBtn, copiedKey === "noRek" && s.copyBtnDone]}
                onPress={() => void copyText(selectedPay.noRek, "noRek")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={copiedKey === "noRek" ? "checkmark" : "copy-outline"}
                  size={14}
                  color={copiedKey === "noRek" ? "#22C55E" : NEO_ACCENT}
                />
                <Text style={[s.copyBtnText, copiedKey === "noRek" && { color: "#22C55E" }]}>
                  {copiedKey === "noRek" ? "Disalin!" : "Salin"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Nama Pemilik */}
            <View style={[s.payDetailRow, { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)", paddingTop: 12 }]}>
              <View style={[s.payMethodIcon, { backgroundColor: "#F59E0B18" }]}>
                <Ionicons name="person-outline" size={16} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.payDetailLabel}>Nama Pemilik</Text>
                <Text style={s.payDetailValue}>{selectedPay.nama}</Text>
              </View>
              <TouchableOpacity
                style={[s.copyBtn, copiedKey === "nama" && s.copyBtnDone]}
                onPress={() => void copyText(selectedPay.nama, "nama")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={copiedKey === "nama" ? "checkmark" : "copy-outline"}
                  size={14}
                  color={copiedKey === "nama" ? "#22C55E" : NEO_ACCENT}
                />
                <Text style={[s.copyBtnText, copiedKey === "nama" && { color: "#22C55E" }]}>
                  {copiedKey === "nama" ? "Disalin!" : "Salin"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Jumlah transfer */}
          {userBuying && idrAmount > 0 && (
            <View style={s.payAmountRow}>
              <Text style={s.payAmountLabel}>Jumlah Transfer</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={s.payAmountValue}>Rp {Math.round(idrAmount).toLocaleString("id-ID")}</Text>
                <TouchableOpacity
                  style={[s.copyBtn, copiedKey === "idr" && s.copyBtnDone]}
                  onPress={() => void copyText(String(Math.round(idrAmount)), "idr")}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={copiedKey === "idr" ? "checkmark" : "copy-outline"}
                    size={14}
                    color={copiedKey === "idr" ? "#22C55E" : NEO_ACCENT}
                  />
                  <Text style={[s.copyBtnText, copiedKey === "idr" && { color: "#22C55E" }]}>
                    {copiedKey === "idr" ? "Disalin!" : "Salin"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={s.payWarning}>
            ⚠️ Kosongkan kolom berita/catatan saat transfer. Jangan tulis nominal atau kripto.
          </Text>
        </View>

        {/* ── Persyaratan Pengiklan ── */}
        <View style={[s.reqCard, neoRaisedMd]}>
          <Text style={s.reqTitle}>Persyaratan Pengiklan</Text>
          <TouchableOpacity style={s.reqTraderRow} activeOpacity={0.85}>
            <View style={s.reqTraderLeft}>
              <View style={s.reqAvatar}>
                <Text style={s.reqAvatarText}>A</Text>
              </View>
              <Text style={s.reqTraderName}>Admin</Text>
              <Text style={{ fontSize: 13 }}>✅</Text>
            </View>
            <View style={s.reqTraderRight}>
              <View style={[s.onlineDot, { backgroundColor: "#22C55E" }]} />
              <Text style={s.lastSeenText}>Online</Text>
              <Ionicons name="chevron-forward" size={14} color={NEO_MUTED} />
            </View>
          </TouchableOpacity>
          <Text style={s.reqText}>{listing.requirements ?? ""}</Text>
        </View>
      </ScrollView>

      {/* ── Bottom: Pasang Order ── */}
      <View style={[s.bottomBar, neoBottom, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[s.pasangBtn, { backgroundColor: actionColor, opacity: isValid ? 1 : 0.55 }]}
          onPress={handlePasangOrder}
          activeOpacity={0.88}
        >
          <Text style={s.pasangBtnText}>Pasang Order</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: NEO_BG,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  assetIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  assetIconText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  priceSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  priceSubText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 },

  /* Mode tabs + amount card */
  tabCard: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden" },
  modeTabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  modeTab: { flex: 1, alignItems: "center", paddingVertical: 14, position: "relative" },
  modeTabText: { fontSize: 14, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  modeTabTextActive: { fontFamily: "Inter_700Bold", color: NEO_TEXT },
  modeTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2.5,
    backgroundColor: NEO_ACCENT,
    borderRadius: 2,
  },

  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontFamily: "Inter_400Regular",
    color: NEO_TEXT,
    padding: 0,
    minHeight: 44,
  },
  amountRight: { alignItems: "flex-end", gap: 6 },
  amountUnit: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  maksBtn: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },

  limitText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, paddingHorizontal: 18, marginBottom: 4 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingBottom: 4 },
  balanceText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },

  terimaSep: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginHorizontal: 18, marginVertical: 12 },
  terimaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingBottom: 18 },
  terimaLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  terimaValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },

  /* Payment card */
  payCard: { backgroundColor: NEO_BG, borderRadius: 16, overflow: "hidden" },
  payCardHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  payCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT, textTransform: "uppercase", letterSpacing: 0.5 },
  methodTab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  methodTabActive: { backgroundColor: NEO_ACCENT },
  methodTabText: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  methodTabTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  payDetail: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  payDetailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12 },
  payMethodIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  payDetailLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 2 },
  payDetailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  payDetailValueLarge: { fontSize: 20, fontFamily: "Inter_700Bold", color: NEO_TEXT, letterSpacing: 1 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: NEO_ACCENT + "15" },
  copyBtnDone: { backgroundColor: "#22C55E15" },
  copyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  payAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  payAmountLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  payAmountValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  payWarning: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#D97706", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, lineHeight: 16 },

  /* Requirements */
  reqCard: { backgroundColor: NEO_BG, borderRadius: 16, padding: 16, gap: 12 },
  reqTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  reqTraderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reqTraderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: NEO_ACCENT + "22", alignItems: "center", justifyContent: "center" },
  reqAvatarText: { fontSize: 12, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  reqTraderName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  reqTraderRight: { flexDirection: "row", alignItems: "center", gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5 },
  lastSeenText: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  reqText: { fontSize: 12.5, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 20 },

  /* Bottom */
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: NEO_BG },
  pasangBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  pasangBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
});
