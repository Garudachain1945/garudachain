import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  Modal,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoInset, neoAccentBtn, neoBottom,
} from "@/constants/neo";
import { getActiveAccount, loadWallet } from "@/utils/wallet-storage";
import { deriveKey, buildAndSignTx } from "@/utils/wallet-crypto";
import {
  getUTXOs, broadcastTx, formatGRD, getAddressInfo,
  prepareTokenTransfer, getStablecoinList, getPeggedStablecoinList, getStockList,
  type StablecoinEntry, type StockEntry,
} from "@/utils/garuda-api";
import { type TxOutput } from "@/utils/wallet-crypto";
import { AssetLogo } from "@/components/AssetLogo";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const FEE_SATOSHI = 1000;

interface SendAsset {
  assetId: string;
  symbol: string;
  name: string;
  tipe: "NATIVE" | "STABLECOIN" | "STABLECOIN_PEGGED" | "SAHAM";
}

const GRD_ASSET: SendAsset = {
  assetId: "native-grd",
  symbol: "GRD",
  name: "GarudaChain",
  tipe: "NATIVE",
};

export default function KirimScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [balanceSatoshi, setBalanceSatoshi] = useState(0);
  const [myAddress, setMyAddress] = useState("");
  const [txid, setTxid] = useState("");

  // Asset selection
  const [selectedAsset, setSelectedAsset] = useState<SendAsset>(GRD_ASSET);
  const [assetList, setAssetList] = useState<SendAsset[]>([GRD_ASSET]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    void (async () => {
      const account = await getActiveAccount();
      if (account) {
        setMyAddress(account.address);
        try {
          const info = await getAddressInfo(account.address);
          setBalanceSatoshi(info.balance ?? 0);
        } catch {}
      }
    })();
  }, []);

  // Load all sendable assets
  useEffect(() => {
    void (async () => {
      try {
        const sc: StablecoinEntry[] = await getStablecoinList().catch(() => []);
        const pegged: StablecoinEntry[] = await getPeggedStablecoinList().catch(() => []);
        const st: StockEntry[] = await getStockList().catch(() => []);
        const list: SendAsset[] = [
          GRD_ASSET,
          ...sc.map((s) => ({ assetId: s.assetId, symbol: s.symbol, name: s.name, tipe: "STABLECOIN" as const })),
          ...pegged.map((s) => ({ assetId: s.assetId, symbol: s.symbol, name: s.name, tipe: "STABLECOIN_PEGGED" as const })),
          ...st.map((s) => ({ assetId: s.assetId, symbol: s.symbol, name: s.name, tipe: "SAHAM" as const })),
        ];
        setAssetList(list);
      } catch {}
    })();
  }, []);

  const amountNum = parseFloat(amount || "0");
  const amountSatoshi = Math.floor(amountNum * 1e8);

  const canSend = (() => {
    if (!address.startsWith("grd1") || amountNum <= 0) return false;
    if (selectedAsset.tipe === "NATIVE") {
      return amountSatoshi + FEE_SATOSHI <= balanceSatoshi;
    }
    return true; // For stablecoin/saham, server validates balance
  })();

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setAddress(text.trim());
  };

  const handleScanQR = async () => {
    if (Platform.OS === "web") {
      // Web: gunakan BarcodeDetector + file input camera
      if (!("BarcodeDetector" in window)) {
        // Fallback: clipboard paste
        const text = await Clipboard.getStringAsync();
        if (text.startsWith("grd1")) { setAddress(text.trim()); return; }
        Alert.alert("Scan QR", "Salin alamat dari aplikasi lain lalu tekan ikon clipboard.");
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      (input as HTMLInputElement & { capture: string }).capture = "environment";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const barcodes = await detector.detect(img);
            if (barcodes.length > 0) {
              setAddress(barcodes[0].rawValue.trim());
            } else {
              Alert.alert("Tidak Terdeteksi", "QR code tidak ditemukan dalam gambar.");
            }
          } catch {
            Alert.alert("Error", "Gagal decode QR.");
          } finally {
            URL.revokeObjectURL(img.src);
          }
        };
      };
      input.click();
    } else {
      // Native: tempel dari clipboard (scan dulu pakai kamera system)
      const text = await Clipboard.getStringAsync();
      if (text.startsWith("grd1")) {
        setAddress(text.trim());
      } else {
        Alert.alert("Scan QR", "Scan QR dengan kamera sistem, salin alamat, lalu tekan ini lagi.");
      }
    }
  };

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      if (selectedAsset.tipe === "NATIVE") {
        // GRD: build + sign + broadcast
        const wallet = await loadWallet();
        if (!wallet) throw new Error("Wallet tidak ditemukan");
        const key = await deriveKey(wallet.mnemonic, 0);
        const utxos = await getUTXOs(myAddress);
        if (!utxos.length) throw new Error("Tidak ada UTXO tersedia");

        const needed = amountSatoshi + FEE_SATOSHI;
        let collected = 0;
        const selectedUtxos: typeof utxos = [];
        for (const u of utxos) {
          selectedUtxos.push(u);
          collected += u.value;
          if (collected >= needed) break;
        }
        const outputs: import("@/utils/wallet-crypto").TxOutput[] = [
          { address, value: amountSatoshi },
        ];
        const change = collected - needed;
        if (change > 546) outputs.push({ address: myAddress, value: change });

        const rawHex = await buildAndSignTx(selectedUtxos, outputs, key.privateKey, key.publicKey);
        const result = await broadcastTx(rawHex);
        setTxid(result.txid);
      } else {
        // Stablecoin / Saham: sign OP_RETURN locally (non-custodial)
        const wallet = await loadWallet();
        if (!wallet) throw new Error("Wallet tidak ditemukan");
        const key = await deriveKey(wallet.mnemonic, 0);
        // Dapatkan OP_RETURN data dari server
        const prep = await prepareTokenTransfer({
          asset_id: selectedAsset.assetId,
          amount: amountNum,
          from: myAddress,
          to: address,
        });
        if (prep.error || !prep.opreturn_data) throw new Error(prep.error ?? "Gagal prepare transfer");
        // Kumpulkan UTXO untuk fee
        const utxos = await getUTXOs(myAddress);
        if (!utxos.length) throw new Error("Tidak ada UTXO (butuh sedikit GRD untuk fee)");
        let feeCollected = 0;
        const feeUtxos: typeof utxos = [];
        for (const u of utxos) {
          feeUtxos.push(u);
          feeCollected += u.value;
          if (feeCollected >= FEE_SATOSHI + 546) break;
        }
        if (feeCollected < FEE_SATOSHI) throw new Error("Saldo GRD tidak cukup untuk fee");
        const feeOuts: TxOutput[] = [{ opreturn: prep.opreturn_data, value: 0 }];
        const change = feeCollected - FEE_SATOSHI;
        if (change > 546) feeOuts.push({ address: myAddress, value: change });
        const rawHex = await buildAndSignTx(feeUtxos, feeOuts, key.privateKey, key.publicKey);
        const result = await broadcastTx(rawHex);
        setTxid(result.txid);
      }
      setShowConfirm(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal mengirim transaksi";
      Alert.alert("Gagal", msg);
    } finally {
      setSending(false);
    }
  };

  const filteredAssets = assetList.filter((a) => {
    if (!pickerSearch) return true;
    return (
      a.symbol.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      a.name.toLowerCase().includes(pickerSearch.toLowerCase())
    );
  });

  const tipeLabel = (tipe: SendAsset["tipe"]) => {
    if (tipe === "NATIVE") return "Native";
    if (tipe === "STABLECOIN") return "Stablecoin";
    if (tipe === "STABLECOIN_PEGGED") return "Oracle";
    return "Saham";
  };

  const tipeColor = (tipe: SendAsset["tipe"]) => {
    if (tipe === "NATIVE") return "#C8922A";
    if (tipe === "STABLECOIN" || tipe === "STABLECOIN_PEGGED") return "#2563EB";
    return "#8B0000";
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
        <Text style={styles.headerTitle}>Kirim {selectedAsset.symbol}</Text>
        <View style={{ width: 40 }} />
      </View>

      {txid ? (
        <View style={styles.successBox}>
          <Ionicons name="checkmark-circle" size={56} color="#22C55E" />
          <Text style={styles.successTitle}>Berhasil Terkirim!</Text>
          <Text style={styles.successTxid}>
            TXID: {txid.length > 20 ? `${txid.slice(0, 16)}...${txid.slice(-8)}` : txid}
          </Text>
          <TouchableOpacity
            style={[styles.confirmBtn, neoAccentBtn, { marginTop: 24 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.confirmBtnText}>Kembali ke Beranda</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Asset Selector */}
          <TouchableOpacity
            style={[styles.assetSelector, neoRaisedMd]}
            onPress={() => { setShowPicker(true); setPickerSearch(""); }}
            activeOpacity={0.8}
          >
            <AssetLogo symbol={selectedAsset.symbol} tipe={selectedAsset.tipe} size={44} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.assetName}>{selectedAsset.name}</Text>
              <Text style={styles.assetBalance}>
                {selectedAsset.tipe === "NATIVE"
                  ? `Saldo: ${formatGRD(balanceSatoshi)}`
                  : `Tipe: ${tipeLabel(selectedAsset.tipe)}`}
              </Text>
            </View>
            <View style={[styles.assetChip, { backgroundColor: tipeColor(selectedAsset.tipe) + "22" }]}>
              <Text style={[styles.assetChipText, { color: tipeColor(selectedAsset.tipe) }]}>
                {tipeLabel(selectedAsset.tipe)}
              </Text>
            </View>
            <Ionicons name={"chevron-down" as IoniconName} size={16} color={NEO_MUTED} style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Alamat Penerima</Text>
          <View style={[styles.inputRow, neoInset]}>
            <TextInput
              style={styles.input}
              placeholder="grd1q..."
              placeholderTextColor={NEO_MUTED}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.inputAction}
              onPress={handlePaste}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={"clipboard-outline" as IoniconName} size={18} color={NEO_ACCENT} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.inputAction} onPress={() => void handleScanQR()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={"qr-code-outline" as IoniconName} size={18} color={NEO_ACCENT} />
            </TouchableOpacity>
          </View>
          {address.length > 0 && !address.startsWith("grd1") && (
            <Text style={styles.errorText}>Alamat harus dimulai dengan grd1</Text>
          )}

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
            Jumlah ({selectedAsset.symbol})
          </Text>
          <View style={[styles.inputRow, neoInset]}>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={NEO_MUTED}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputSymbol}>{selectedAsset.symbol}</Text>
            {selectedAsset.tipe === "NATIVE" && (
              <TouchableOpacity
                style={styles.maxBtn}
                onPress={() => {
                  const max = Math.max(0, balanceSatoshi - FEE_SATOSHI);
                  setAmount((max / 1e8).toFixed(8));
                }}
              >
                <Text style={styles.maxBtnText}>MAX</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.summaryCard, neoRaisedMd]}>
            <Text style={styles.summaryTitle}>Ringkasan Transaksi</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Aset</Text>
              <Text style={styles.summaryValue}>{selectedAsset.name} ({selectedAsset.symbol})</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Jumlah Kirim</Text>
              <Text style={styles.summaryValue}>{amount || "0"} {selectedAsset.symbol}</Text>
            </View>
            {selectedAsset.tipe === "NATIVE" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Biaya Jaringan (est.)</Text>
                <Text style={styles.summaryValue}>{formatGRD(FEE_SATOSHI)}</Text>
              </View>
            )}
            <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", marginTop: 8, paddingTop: 10 }]}>
              <Text style={[styles.summaryLabel, { fontFamily: "Inter_600SemiBold", color: NEO_TEXT }]}>Penerima Dapat</Text>
              <Text style={[styles.summaryValue, { color: NEO_ACCENT, fontFamily: "Inter_700Bold" }]}>
                {amount ? `~${amount} ${selectedAsset.symbol}` : "—"}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {!txid && (
        <View style={[styles.bottomBar, neoBottom, { paddingBottom: bottomPad + 12 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, neoAccentBtn, !canSend && styles.confirmBtnDisabled]}
            activeOpacity={0.8}
            onPress={() => setShowConfirm(true)}
            disabled={!canSend}
          >
            <Text style={styles.confirmBtnText}>
              Kirim {selectedAsset.symbol}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Confirm Sheet */}
      {showConfirm && (
        <View style={StyleSheet.absoluteFillObject}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowConfirm(false)} activeOpacity={1} />
          <View style={[styles.confirmSheet, { paddingBottom: bottomPad + 20 }]}>
            <View style={styles.confirmHandle} />
            <Text style={styles.confirmTitle}>Konfirmasi Pengiriman</Text>
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <AssetLogo symbol={selectedAsset.symbol} tipe={selectedAsset.tipe} size={52} />
            </View>
            <View style={styles.confirmDetail}>
              <Text style={styles.confirmLabel}>Kirim</Text>
              <Text style={styles.confirmAmountLg}>{amount} {selectedAsset.symbol}</Text>
            </View>
            <View style={styles.confirmDetail}>
              <Text style={styles.confirmLabel}>Ke Alamat</Text>
              <Text style={styles.confirmAddr} numberOfLines={1}>{address}</Text>
            </View>
            {selectedAsset.tipe === "NATIVE" && (
              <View style={styles.confirmDetail}>
                <Text style={styles.confirmLabel}>Biaya Jaringan</Text>
                <Text style={styles.confirmValue}>{formatGRD(FEE_SATOSHI)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.confirmSendBtn, neoAccentBtn]}
              onPress={handleSend}
              activeOpacity={0.85}
              disabled={sending}
            >
              <Ionicons name={"send" as IoniconName} size={18} color="#fff" />
              <Text style={styles.confirmSendText}>{sending ? "Mengirim..." : "Kirim Sekarang"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirm(false)} disabled={sending}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Asset Picker Modal */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Pilih Aset</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)} activeOpacity={0.7}>
              <Ionicons name={"close" as IoniconName} size={22} color={NEO_TEXT} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.pickerSearchRow}>
            <Ionicons name={"search-outline" as IoniconName} size={16} color={NEO_MUTED} />
            <TextInput
              style={styles.pickerSearchInput}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Cari aset..."
              placeholderTextColor={NEO_MUTED}
              autoFocus
            />
          </View>

          <ScrollView>
            {filteredAssets.map((asset) => (
              <TouchableOpacity
                key={asset.assetId}
                style={[
                  styles.pickerRow,
                  selectedAsset.assetId === asset.assetId && { backgroundColor: NEO_ACCENT + "11" },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedAsset(asset);
                  setAmount("");
                  setShowPicker(false);
                }}
              >
                <AssetLogo symbol={asset.symbol} tipe={asset.tipe} size={40} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pickerSymbol}>{asset.symbol}</Text>
                  <Text style={styles.pickerName}>{asset.name}</Text>
                </View>
                <View style={[styles.pipeBadge, { backgroundColor: tipeColor(asset.tipe) + "22" }]}>
                  <Text style={[styles.pipeBadgeText, { color: tipeColor(asset.tipe) }]}>
                    {tipeLabel(asset.tipe)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEO_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase",
  },
  // Asset selector row
  assetSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 18,
    padding: 14,
  },
  assetName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  assetBalance: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  assetChip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  assetChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Inputs
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_TEXT, height: 48 },
  inputAction: { padding: 6 },
  inputSymbol: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  maxBtn: { backgroundColor: NEO_ACCENT + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  maxBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  errorText: { fontSize: 12, color: "#EF4444", marginTop: 6, marginLeft: 4 },
  // Summary
  summaryCard: { marginTop: 20, backgroundColor: NEO_BG, borderRadius: 18, padding: 18 },
  summaryTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, flexShrink: 1, textAlign: "right", marginLeft: 8 },
  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12, backgroundColor: NEO_BG,
    borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)",
  },
  confirmBtn: { height: 54, borderRadius: 16, backgroundColor: NEO_ACCENT, alignItems: "center", justifyContent: "center" },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" },
  // Confirm sheet
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  confirmSheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: NEO_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24,
  },
  confirmHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.12)", alignSelf: "center", marginBottom: 20 },
  confirmTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, textAlign: "center", marginBottom: 16 },
  confirmDetail: { marginBottom: 16 },
  confirmLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  confirmAmountLg: { fontSize: 24, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  confirmAddr: { fontSize: 13, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  confirmValue: { fontSize: 14, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  confirmSendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 16, backgroundColor: NEO_ACCENT, marginTop: 8 },
  confirmSendText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" },
  cancelBtn: { alignItems: "center", marginTop: 14 },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  // Success
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginTop: 16 },
  successTxid: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 8, textAlign: "center" },
  // Picker modal
  pickerModal: { flex: 1, backgroundColor: NEO_BG },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)",
  },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  pickerSearchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: "#F3F4F6", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, height: 24 },
  pickerRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  pickerSymbol: { fontSize: 14, fontFamily: "Inter_700Bold", color: NEO_TEXT, marginBottom: 2 },
  pickerName: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  pipeBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  pipeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
