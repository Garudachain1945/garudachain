import React, { useState } from "react";
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
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { addMyListing, type P2PMyListing } from "@/utils/p2p-storage";
import {
  NEO_BG,
  NEO_TEXT,
  NEO_MUTED,
  NEO_ACCENT,
  neoRaisedMd,
  neoInset,
  neoAccentBtn,
  neoBottom,
} from "@/constants/neo";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const ASSETS = ["USDT", "BTC", "ETH", "BNB", "SOL"];
const PAYMENTS_LIST = ["BCA", "BRI", "Mandiri", "GoPay", "OVO", "DANA"];
const EWALLET = ["GoPay", "OVO", "DANA"];
const PAYMENT_TIMES = ["15 menit", "30 menit", "1 jam", "2 jam"];
const TAGS = ["Ritel", "Profesional", "Hanya KYC", "Lokal", "Cepat Respons", "Terpercaya"];

const HARGA_REF: Record<string, number> = {
  USDT: 16_550,
  BTC: 1_640_000_000,
  ETH: 55_100_000,
  BNB: 9_200_000,
  SOL: 2_400_000,
};

const noRekLabel = (p: string) =>
  EWALLET.includes(p) ? "Nomor HP / Akun" : "Nomor Rekening";

interface PaymentDetail {
  method: string;
  noRek: string;
  nama: string;
}

const STEPS = [
  { num: 1, label: "Atur Jenis\n& Harga" },
  { num: 2, label: "Atur Jumlah\n& Metode" },
  { num: 3, label: "Atur\nSyarat" },
];

export default function P2PBuatIklanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState(1);

  /* ── Step 1 state ── */
  const [tipe, setTipe] = useState<"beli" | "jual">("beli");
  const [aset, setAset] = useState("USDT");
  const [hargaInput, setHargaInput] = useState(String(HARGA_REF["USDT"]));

  /* ── Step 2 state ── */
  const [jumlah, setJumlah] = useState("");
  const [minLimit, setMinLimit] = useState("10000");
  const [maxLimit, setMaxLimit] = useState("2000000");
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>([]);
  const [waktuPembayaran, setWaktuPembayaran] = useState("15 menit");
  const [showWaktuPicker, setShowWaktuPicker] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addPayMethod, setAddPayMethod] = useState<string | null>(null);
  const [addNoRek, setAddNoRek] = useState("");
  const [addNama, setAddNama] = useState("");

  /* ── Step 3 state ── */
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [persyaratan, setPersyaratan] = useState("");
  const [balasOtomatis, setBalasOtomatis] = useState("");
  const [hariTerdaftar, setHariTerdaftar] = useState("0");
  const [terdaftarChecked, setTerdaftarChecked] = useState(false);

  /* ── Computed ── */
  const hargaNum = parseInt(hargaInput.replace(/\D/g, "") || "0", 10);
  const refHarga = HARGA_REF[aset] || 1;
  const hargaMin = Math.round(refHarga * 0.97);
  const hargaMax = Math.round(refHarga * 1.23);
  const hargaIklanTertinggi = Math.round(hargaNum * 1.0045);
  const jumlahNum = parseFloat(jumlah || "0");
  const jumlahIdr = jumlahNum * hargaNum;
  const minLimitNum = parseInt(minLimit.replace(/\D/g, "") || "0", 10);
  const maxLimitNum = parseInt(maxLimit.replace(/\D/g, "") || "0", 10);
  const minLimitAset = hargaNum > 0 ? (minLimitNum / hargaNum).toFixed(2) : "0";
  const maxLimitAset = hargaNum > 0 ? (maxLimitNum / hargaNum).toFixed(2) : "0";
  const estimasiBiaya = jumlahNum > 0 ? (jumlahNum * 0.001).toFixed(4) : "0";

  const formatRp = (n: number) =>
    "Rp" + n.toLocaleString("id-ID");

  const canGoStep2 = hargaNum > 0 && hargaNum >= hargaMin && hargaNum <= hargaMax;
  const canGoStep3 = paymentDetails.length > 0 && (jumlah === "" || jumlahNum > 0);

  /* ── Payment helpers ── */
  const removePayment = (idx: number) =>
    setPaymentDetails((prev) => prev.filter((_, i) => i !== idx));

  const confirmAddPayment = () => {
    if (!addPayMethod || addNoRek.trim() === "" || addNama.trim() === "") return;
    setPaymentDetails((prev) => [
      ...prev,
      { method: addPayMethod, noRek: addNoRek.trim(), nama: addNama.trim().toUpperCase() },
    ]);
    setAddPayMethod(null);
    setAddNoRek("");
    setAddNama("");
    setShowAddPayment(false);
  };

  /* ── Step nav ── */
  const goNext = () => {
    if (step === 1 && !canGoStep2) {
      Alert.alert("Harga Tidak Valid", `Masukkan harga antara ${formatRp(hargaMin)} dan ${formatRp(hargaMax)}.`);
      return;
    }
    if (step === 2 && !canGoStep3) {
      Alert.alert("Belum Lengkap", "Tambahkan minimal 1 metode pembayaran.");
      return;
    }
    if (step < 3) setStep((s) => s + 1);
  };

  const handlePratinjau = async () => {
    if (paymentDetails.length === 0) {
      Alert.alert("Belum Lengkap", "Tambahkan minimal 1 metode pembayaran dengan nomor rekening.");
      return;
    }

    const newListing: P2PMyListing = {
      id: `listing_${Date.now()}`,
      type: tipe,
      asset: aset,
      price: formatRp(hargaNum),
      priceNum: hargaNum,
      limitMin: minLimitNum,
      limitMax: maxLimitNum,
      payment: paymentDetails.map((p) => p.method).join(", "),
      payments: paymentDetails,
      status: "aktif",
      orders: 0,
      createdAt: new Date().toISOString(),
      requirements: persyaratan.trim() || undefined,
      timeLimit: waktuPembayaran.includes("jam")
        ? parseInt(waktuPembayaran, 10) * 60
        : parseInt(waktuPembayaran, 10) || 15,
    };

    await addMyListing(newListing);

    Alert.alert(
      "Iklan Berhasil Diterbitkan! 🎉",
      `Iklan ${tipe.toUpperCase()} ${aset} seharga ${formatRp(hargaNum)} kini tayang di pasar P2P.`,
      [{ text: "Lihat Iklan Saya", onPress: () => router.back() }]
    );
  };

  /* ───────────────────── RENDER ───────────────────── */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NEO_BG }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={[s.backBtn, neoRaisedMd]} onPress={() => (step > 1 ? setStep((v) => v - 1) : router.back())} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={NEO_TEXT} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Posting Iklan</Text>
        <TouchableOpacity style={[s.backBtn, neoRaisedMd]} activeOpacity={0.8}>
          <Ionicons name="help-circle-outline" size={20} color={NEO_MUTED} />
        </TouchableOpacity>
      </View>

      {/* Step indicator */}
      <View style={s.stepBar}>
        {STEPS.map((st, idx) => {
          const done = step > st.num;
          const active = step === st.num;
          return (
            <React.Fragment key={st.num}>
              <View style={s.stepItem}>
                <View style={[s.stepCircle, done && s.stepDone, active && s.stepActive]}>
                  {done ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Text style={[s.stepNum, active && { color: "#fff" }]}>{st.num}</Text>
                  )}
                </View>
                <Text style={[s.stepLabel, active && s.stepLabelActive, done && s.stepLabelDone]}>
                  {st.label}
                </Text>
              </View>
              {idx < STEPS.length - 1 && (
                <View style={[s.stepLine, (done) && s.stepLineDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ══════════ STEP 1 ══════════ */}
        {step === 1 && (
          <>
            {/* Saya ingin */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Saya ingin</Text>
              <View style={s.toggleRow}>
                <TouchableOpacity
                  style={[s.toggleBtn, tipe === "beli" && s.toggleBtnActive]}
                  onPress={() => setTipe("beli")}
                  activeOpacity={0.85}
                >
                  <Text style={[s.toggleBtnText, tipe === "beli" && s.toggleBtnTextActive]}>Beli</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, tipe === "jual" && s.toggleBtnActiveJual]}
                  onPress={() => setTipe("jual")}
                  activeOpacity={0.85}
                >
                  <Text style={[s.toggleBtnText, tipe === "jual" && s.toggleBtnTextActive]}>Jual</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Aset & Fiat */}
            <View style={[s.card, neoRaisedMd, s.row2]}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Aset</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.assetRow}>
                    {ASSETS.map((a) => (
                      <TouchableOpacity
                        key={a}
                        style={[s.assetChip, aset === a && s.assetChipActive]}
                        onPress={() => {
                          setAset(a);
                          setHargaInput(String(HARGA_REF[a] || 0));
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.assetChipText, aset === a && s.assetChipTextActive]}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={s.fiatBox}>
                <Text style={s.fieldLabel}>Fiat</Text>
                <View style={[s.fiatPill, neoInset]}>
                  <Text style={s.fiatText}>IDR</Text>
                  <Ionicons name="chevron-down" size={14} color={NEO_MUTED} />
                </View>
              </View>
            </View>

            {/* Jenis Harga */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Jenis Harga</Text>
              <View style={[s.selectBox, neoInset]}>
                <Text style={s.selectText}>Tetap</Text>
                <Ionicons name="chevron-down" size={16} color={NEO_MUTED} />
              </View>
            </View>

            {/* Harga */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Tetap</Text>
              <View style={[s.hargaRow, neoInset]}>
                <TouchableOpacity
                  style={s.hargaBtn}
                  onPress={() => setHargaInput(String(Math.max(0, hargaNum - 100)))}
                >
                  <Ionicons name="remove" size={20} color={NEO_TEXT} />
                </TouchableOpacity>
                <TextInput
                  style={s.hargaInput}
                  value={hargaInput}
                  onChangeText={(t) => setHargaInput(t.replace(/\D/g, ""))}
                  keyboardType="numeric"
                  textAlign="center"
                />
                <TouchableOpacity
                  style={s.hargaBtn}
                  onPress={() => setHargaInput(String(hargaNum + 100))}
                >
                  <Ionicons name="add" size={20} color={NEO_TEXT} />
                </TouchableOpacity>
              </View>
              <Text style={s.rentangText}>
                Rentang harga: {formatRp(hargaMin)} – {formatRp(hargaMax)}
              </Text>
              {hargaNum > 0 && (hargaNum < hargaMin || hargaNum > hargaMax) && (
                <Text style={s.errorText}>
                  <Ionicons name="alert-circle" size={12} color="#EF4444" /> Harga di luar rentang yang diizinkan
                </Text>
              )}
              <View style={s.hargaResultWrap}>
                <View style={s.hargaResultRow}>
                  <Text style={s.hargaResultLabel}>Harga Anda</Text>
                  <Text style={s.hargaResultValue}>{formatRp(hargaNum)}</Text>
                </View>
                <View style={s.hargaResultRow}>
                  <Text style={s.hargaResultLabel}>Harga Iklan Tertinggi</Text>
                  <Text style={[s.hargaResultValue, { color: NEO_ACCENT }]}>{formatRp(hargaIklanTertinggi)}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ══════════ STEP 2 ══════════ */}
        {step === 2 && (
          <>
            {/* Jumlah total */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Jumlah total</Text>
              <View style={[s.inputRow, neoInset]}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Masukkan jumlah total"
                  placeholderTextColor={NEO_MUTED}
                  keyboardType="decimal-pad"
                  value={jumlah}
                  onChangeText={setJumlah}
                />
                <Text style={s.inputSuffix}>{aset}</Text>
              </View>
              <Text style={s.convText}>≈ {jumlahIdr > 0 ? formatRp(Math.round(jumlahIdr)) : "0 IDR"}</Text>
            </View>

            {/* Limit Order */}
            <View style={[s.card, neoRaisedMd]}>
              <View style={s.rowBetween}>
                <Text style={s.fieldLabel}>Limit Order</Text>
                <Ionicons name="information-circle-outline" size={16} color={NEO_MUTED} />
              </View>
              <View style={s.limitRow}>
                <View style={{ flex: 1 }}>
                  <View style={[s.limitInput, neoInset]}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={minLimit}
                      onChangeText={(t) => setMinLimit(t.replace(/\D/g, ""))}
                      keyboardType="numeric"
                    />
                    <Text style={s.inputSuffix}>IDR</Text>
                  </View>
                  <Text style={s.convText}>≈ {minLimitAset} {aset}</Text>
                </View>
                <Text style={s.limitSep}>~</Text>
                <View style={{ flex: 1 }}>
                  <View style={[s.limitInput, neoInset]}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={maxLimit}
                      onChangeText={(t) => setMaxLimit(t.replace(/\D/g, ""))}
                      keyboardType="numeric"
                    />
                    <Text style={s.inputSuffix}>IDR</Text>
                  </View>
                  <Text style={s.convText}>≈ {maxLimitAset} {aset}</Text>
                </View>
              </View>
            </View>

            {/* Metode Pembayaran */}
            <View style={[s.card, neoRaisedMd]}>
              <View style={s.rowBetween}>
                <View>
                  <Text style={s.fieldLabel}>Metode Pembayaran</Text>
                  <Text style={s.hintText}>Pilih hingga 5 metode.</Text>
                </View>
                {paymentDetails.length < 5 && (
                  <TouchableOpacity
                    style={[s.tambahBtn, neoRaisedMd]}
                    onPress={() => setShowAddPayment(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={16} color={NEO_ACCENT} />
                    <Text style={s.tambahBtnText}>Tambah</Text>
                  </TouchableOpacity>
                )}
              </View>

              {paymentDetails.length === 0 && (
                <TouchableOpacity
                  style={s.addPayPlaceholder}
                  onPress={() => setShowAddPayment(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="card-outline" size={22} color={NEO_MUTED} />
                  <Text style={s.addPayPlaceholderText}>Belum ada metode. Tap Tambah.</Text>
                </TouchableOpacity>
              )}

              {paymentDetails.map((p, idx) => (
                <View key={idx} style={s.paymentItem}>
                  <View style={s.payMethodBadge}>
                    <Ionicons
                      name={(EWALLET.includes(p.method) ? "phone-portrait-outline" : "card-outline") as IoniconName}
                      size={14}
                      color={NEO_ACCENT}
                    />
                    <Text style={s.payMethodText}>{p.method}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.payNoRek}>{p.noRek}</Text>
                    <Text style={s.payNama}>a/n {p.nama}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removePayment(idx)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle-outline" size={20} color={NEO_MUTED} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Batas Waktu */}
            <View style={[s.card, neoRaisedMd]}>
              <View style={s.rowBetween}>
                <Text style={s.fieldLabel}>Batas Waktu Pembayaran</Text>
                <Ionicons name="information-circle-outline" size={16} color={NEO_MUTED} />
              </View>
              <TouchableOpacity
                style={[s.selectBox, neoInset]}
                onPress={() => setShowWaktuPicker(true)}
                activeOpacity={0.8}
              >
                <Text style={s.selectText}>{waktuPembayaran}</Text>
                <Ionicons name="chevron-down" size={16} color={NEO_MUTED} />
              </TouchableOpacity>
            </View>

            {/* Estimasi biaya */}
            <View style={[s.estimasiBar, neoRaisedMd]}>
              <Text style={s.estimasiLabel}>Estimasi Biaya</Text>
              <Text style={s.estimasiValue}>{estimasiBiaya} {aset}</Text>
            </View>
          </>
        )}

        {/* ══════════ STEP 3 ══════════ */}
        {step === 3 && (
          <>
            {/* Tag Ketentuan */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Tag Ketentuan <Text style={s.optionalText}>(Opsional)</Text></Text>
              <TouchableOpacity
                style={[s.selectBox, neoInset]}
                onPress={() => setShowTagPicker(true)}
                activeOpacity={0.8}
              >
                <Text style={selectedTags.length > 0 ? s.selectText : s.placeholderText}>
                  {selectedTags.length > 0 ? selectedTags.join(", ") : "Tambah tag"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={NEO_MUTED} />
              </TouchableOpacity>
              <Text style={s.hintText}>Pilih hingga 3 tag</Text>
              {selectedTags.length > 0 && (
                <View style={s.tagChipRow}>
                  {selectedTags.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={s.tagChip}
                      onPress={() => setSelectedTags((prev) => prev.filter((x) => x !== t))}
                    >
                      <Text style={s.tagChipText}>{t}</Text>
                      <Ionicons name="close" size={12} color={NEO_ACCENT} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Persyaratan */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Persyaratan <Text style={s.optionalText}>(Opsional)</Text></Text>
              <View style={[s.textareaWrap, neoInset]}>
                <TextInput
                  style={s.textarea}
                  placeholder="Persyaratan akan ditampilkan ke lawan transaksi"
                  placeholderTextColor={NEO_MUTED}
                  multiline
                  maxLength={1000}
                  value={persyaratan}
                  onChangeText={setPersyaratan}
                  textAlignVertical="top"
                />
                <Text style={s.charCount}>{persyaratan.length}/1000</Text>
              </View>
            </View>

            {/* Balas Otomatis */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Balas-otomatis <Text style={s.optionalText}>(Opsional)</Text></Text>
              <View style={[s.textareaWrap, neoInset]}>
                <TextInput
                  style={s.textarea}
                  placeholder="Pesan balasan-otomatis akan dikirim ke lawan transaksi setelah order dibuat."
                  placeholderTextColor={NEO_MUTED}
                  multiline
                  maxLength={1000}
                  value={balasOtomatis}
                  onChangeText={setBalasOtomatis}
                  textAlignVertical="top"
                />
                <Text style={s.charCount}>{balasOtomatis.length}/1000</Text>
              </View>
            </View>

            {/* Persyaratan Lawan Transaksi */}
            <View style={[s.card, neoRaisedMd]}>
              <Text style={s.fieldLabel}>Persyaratan Lawan Transaksi</Text>
              <Text style={s.hintText}>Menambahkan persyaratan lawan transaksi akan mengurangi penampilan Iklan Anda</Text>
              <View style={s.checkRow}>
                <TouchableOpacity
                  style={[s.checkbox, terdaftarChecked && s.checkboxChecked]}
                  onPress={() => setTerdaftarChecked((v) => !v)}
                  activeOpacity={0.8}
                >
                  {terdaftarChecked && <Ionicons name="checkmark" size={13} color="#fff" />}
                </TouchableOpacity>
                <Text style={s.checkLabel}>Terdaftar</Text>
                <View style={[s.hariInput, neoInset]}>
                  <TextInput
                    style={s.hariInputText}
                    value={hariTerdaftar}
                    onChangeText={(t) => setHariTerdaftar(t.replace(/\D/g, ""))}
                    keyboardType="numeric"
                    editable={terdaftarChecked}
                  />
                </View>
                <Text style={s.checkLabel}>hari yang lalu</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom nav buttons */}
      <View style={[s.navBar, neoBottom, { paddingBottom: insets.bottom + 12 }]}>
        {step > 1 && (
          <TouchableOpacity
            style={[s.prevBtn, neoRaisedMd]}
            onPress={() => setStep((v) => v - 1)}
            activeOpacity={0.85}
          >
            <Text style={s.prevBtnText}>Sebelumnya</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.nextBtn, neoAccentBtn, step === 1 && { flex: 1 }]}
          onPress={step === 3 ? () => void handlePratinjau() : goNext}
          activeOpacity={0.88}
        >
          <Text style={s.nextBtnText}>{step === 3 ? "Pratinjau" : "Berikutnya"}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal: Tambah Metode Pembayaran ── */}
      <Modal visible={showAddPayment} transparent animationType="slide">
        <View style={m.overlay}>
          <View style={[m.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={m.sheetHandle} />
            <Text style={m.sheetTitle}>Tambah Metode Pembayaran</Text>

            {addPayMethod === null ? (
              <>
                <Text style={m.sheetHint}>Pilih bank atau dompet digital</Text>
                <View style={m.methodGrid}>
                  {PAYMENTS_LIST.filter((p) => !paymentDetails.some((d) => d.method === p)).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[m.methodChip, neoRaisedMd]}
                      onPress={() => setAddPayMethod(p)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={(EWALLET.includes(p) ? "phone-portrait" : "card") as IoniconName}
                        size={18}
                        color={NEO_ACCENT}
                      />
                      <Text style={m.methodChipText}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={m.cancelBtn} onPress={() => setShowAddPayment(false)}>
                  <Text style={m.cancelText}>Batal</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={m.selectedMethodHeader}>
                  <Ionicons
                    name={(EWALLET.includes(addPayMethod) ? "phone-portrait" : "card") as IoniconName}
                    size={20}
                    color={NEO_ACCENT}
                  />
                  <Text style={m.selectedMethodText}>{addPayMethod}</Text>
                  <TouchableOpacity onPress={() => setAddPayMethod(null)}>
                    <Ionicons name="arrow-back-circle-outline" size={22} color={NEO_MUTED} />
                  </TouchableOpacity>
                </View>

                <Text style={m.inputLabel}>{noRekLabel(addPayMethod)}</Text>
                <View style={[m.inputWrap, neoInset]}>
                  <Ionicons
                    name={(EWALLET.includes(addPayMethod) ? "call-outline" : "keypad-outline") as IoniconName}
                    size={16}
                    color={NEO_MUTED}
                  />
                  <TextInput
                    style={m.inputText}
                    placeholder={EWALLET.includes(addPayMethod) ? "cth: 0812-3456-7890" : "cth: 1234567890"}
                    placeholderTextColor={NEO_MUTED}
                    keyboardType="numeric"
                    value={addNoRek}
                    onChangeText={setAddNoRek}
                  />
                </View>

                <Text style={[m.inputLabel, { marginTop: 14 }]}>Nama Pemilik Rekening</Text>
                <View style={[m.inputWrap, neoInset]}>
                  <Ionicons name="person-outline" size={16} color={NEO_MUTED} />
                  <TextInput
                    style={m.inputText}
                    placeholder="cth: BUDI SANTOSO"
                    placeholderTextColor={NEO_MUTED}
                    autoCapitalize="characters"
                    value={addNama}
                    onChangeText={(t) => setAddNama(t.toUpperCase())}
                  />
                </View>

                <TouchableOpacity
                  style={[m.confirmBtn, neoAccentBtn, (!addNoRek.trim() || !addNama.trim()) && { opacity: 0.4 }]}
                  onPress={confirmAddPayment}
                  disabled={!addNoRek.trim() || !addNama.trim()}
                  activeOpacity={0.88}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={m.confirmBtnText}>Simpan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={m.cancelBtn} onPress={() => { setAddPayMethod(null); setAddNoRek(""); setAddNama(""); setShowAddPayment(false); }}>
                  <Text style={m.cancelText}>Batal</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Waktu Pembayaran ── */}
      <Modal visible={showWaktuPicker} transparent animationType="slide">
        <View style={m.overlay}>
          <View style={[m.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={m.sheetHandle} />
            <Text style={m.sheetTitle}>Batas Waktu Pembayaran</Text>
            {PAYMENT_TIMES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[m.pickerItem, waktuPembayaran === t && m.pickerItemActive]}
                onPress={() => { setWaktuPembayaran(t); setShowWaktuPicker(false); }}
                activeOpacity={0.85}
              >
                <Text style={[m.pickerItemText, waktuPembayaran === t && m.pickerItemTextActive]}>{t}</Text>
                {waktuPembayaran === t && <Ionicons name="checkmark-circle" size={20} color={NEO_ACCENT} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Tag ── */}
      <Modal visible={showTagPicker} transparent animationType="slide">
        <View style={m.overlay}>
          <View style={[m.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={m.sheetHandle} />
            <Text style={m.sheetTitle}>Pilih Tag (maks 3)</Text>
            {TAGS.map((t) => {
              const selected = selectedTags.includes(t);
              const disabled = !selected && selectedTags.length >= 3;
              return (
                <TouchableOpacity
                  key={t}
                  style={[m.pickerItem, selected && m.pickerItemActive, disabled && { opacity: 0.4 }]}
                  onPress={() => {
                    if (disabled) return;
                    setSelectedTags((prev) =>
                      selected ? prev.filter((x) => x !== t) : [...prev, t]
                    );
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[m.pickerItemText, selected && m.pickerItemTextActive]}>{t}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={NEO_ACCENT} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[m.confirmBtn, neoAccentBtn, { marginTop: 8 }]}
              onPress={() => setShowTagPicker(false)}
              activeOpacity={0.88}
            >
              <Text style={m.confirmBtnText}>Selesai</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ── Main styles ── */
const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: NEO_BG,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: NEO_TEXT,
  },
  /* Step bar */
  stepBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: NEO_BG,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  stepItem: {
    alignItems: "center",
    gap: 6,
    width: 72,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDone: { backgroundColor: "#22C55E" },
  stepActive: { backgroundColor: NEO_ACCENT },
  stepNum: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_MUTED },
  stepLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", lineHeight: 14 },
  stepLabelActive: { color: NEO_ACCENT, fontFamily: "Inter_600SemiBold" },
  stepLabelDone: { color: "#22C55E" },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginTop: 13,
    marginHorizontal: 4,
    borderRadius: 2,
  },
  stepLineDone: { backgroundColor: "#22C55E" },
  /* Content */
  scroll: { padding: 20, paddingBottom: 32, gap: 14 },
  card: { backgroundColor: NEO_BG, borderRadius: 20, padding: 18, gap: 12 },
  row2: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  hintText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  optionalText: { fontFamily: "Inter_400Regular", color: NEO_MUTED, fontSize: 12 },
  /* Toggle */
  toggleRow: { flexDirection: "row", gap: 0, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 14, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  toggleBtnActive: { backgroundColor: NEO_ACCENT },
  toggleBtnActiveJual: { backgroundColor: "#EF4444" },
  toggleBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  toggleBtnTextActive: { color: "#fff" },
  /* Asset */
  assetRow: { flexDirection: "row", gap: 8 },
  assetChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" },
  assetChipActive: { backgroundColor: NEO_ACCENT },
  assetChipText: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_MUTED },
  assetChipTextActive: { color: "#fff" },
  /* Fiat */
  fiatBox: { alignItems: "flex-start", gap: 8 },
  fiatPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: NEO_BG },
  fiatText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  /* Select */
  selectBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: NEO_BG, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13 },
  selectText: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  placeholderText: { fontSize: 15, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  /* Harga */
  hargaRow: { flexDirection: "row", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 14 },
  hargaBtn: { width: 48, height: 52, alignItems: "center", justifyContent: "center" },
  hargaInput: { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold", color: NEO_TEXT, textAlign: "center", padding: 0 },
  rentangText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#EF4444" },
  hargaResultWrap: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: 12, gap: 8 },
  hargaResultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hargaResultLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  hargaResultValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  /* Input */
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  input: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT, padding: 0 },
  inputSuffix: { fontSize: 14, fontFamily: "Inter_700Bold", color: NEO_MUTED },
  convText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, marginTop: 4 },
  /* Limit */
  limitRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  limitInput: { flexDirection: "row", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  limitSep: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: NEO_MUTED, marginTop: 12 },
  /* Payment */
  tambahBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: NEO_BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  tambahBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  addPayPlaceholder: { alignItems: "center", gap: 6, paddingVertical: 18, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 14, borderStyle: "dashed" },
  addPayPlaceholderText: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  paymentItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: NEO_ACCENT + "0D", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: NEO_ACCENT + "30" },
  payMethodBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: NEO_ACCENT + "18", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  payMethodText: { fontSize: 12, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  payNoRek: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  payNama: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  /* Estimasi */
  estimasiBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 16, padding: 16 },
  estimasiLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  estimasiValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  /* Textarea */
  textareaWrap: { backgroundColor: NEO_BG, borderRadius: 14, padding: 14 },
  textarea: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT, minHeight: 90, padding: 0 },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "right", marginTop: 6 },
  /* Tag */
  tagChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: NEO_ACCENT + "18", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  tagChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  /* Checkbox */
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: NEO_MUTED, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: NEO_ACCENT, borderColor: NEO_ACCENT },
  checkLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT },
  hariInput: { backgroundColor: NEO_BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 54, alignItems: "center" },
  hariInputText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, textAlign: "center" },
  /* Nav */
  navBar: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 14, backgroundColor: NEO_BG },
  prevBtn: { flex: 1, backgroundColor: NEO_BG, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  prevBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  nextBtn: { flex: 1, backgroundColor: NEO_ACCENT, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  nextBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});

/* ── Modal styles ── */
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: NEO_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  sheetHandle: { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: NEO_TEXT, textAlign: "center" },
  sheetHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: NEO_BG, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  methodChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  selectedMethodHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  selectedMethodText: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_ACCENT },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: NEO_BG, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  inputText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT, padding: 0 },
  confirmBtn: { backgroundColor: NEO_ACCENT, borderRadius: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: NEO_MUTED },
  pickerItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.03)" },
  pickerItemActive: { backgroundColor: NEO_ACCENT + "15" },
  pickerItemText: { fontSize: 15, fontFamily: "Inter_500Medium", color: NEO_TEXT },
  pickerItemTextActive: { fontFamily: "Inter_700Bold", color: NEO_ACCENT },
});
