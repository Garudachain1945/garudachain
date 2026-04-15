import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Animated,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd, neoInset,
} from "@/constants/neo";
import {
  getOrderById, updateOrder, processAutoReleases,
  nowTime, formatCountdown, AUTO_RELEASE_MS,
  type P2POrder,
} from "@/utils/p2p-storage";

const STATUS_STEPS = [
  { key: "menunggu",  label: "Menunggu\nPembayaran" },
  { key: "dibayar",  label: "Pembayaran\nDikonfirmasi" },
  { key: "selesai",  label: "Aset\nDilepas" },
] as const;

export default function P2PChatScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order,    setOrder]    = useState<P2POrder | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [inputText, setInputText] = useState("");
  const [msLeft,   setMsLeft]   = useState<number>(0);   // ms sampai auto-release
  const [autoReleased, setAutoReleased] = useState(false);
  const [copiedKey, setCopiedKey]       = useState<string | null>(null);

  const copyText = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const scrollRef   = useRef<ScrollView>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningAnim = useRef(new Animated.Value(0)).current;

  // ── Load order dari AsyncStorage ─────────────────────────────────────────
  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    // Cek dulu auto-release yang sudah jatuh tempo
    await processAutoReleases();
    const o = await getOrderById(orderId);
    if (o) {
      setOrder(o);
      if (o.status === "dibayar" && o.autoReleaseAt) {
        const diff = new Date(o.autoReleaseAt).getTime() - Date.now();
        setMsLeft(Math.max(0, diff));
      }
      if (o.status === "auto_lepas") setAutoReleased(true);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // ── Countdown timer real (detik demi detik) ──────────────────────────────
  useEffect(() => {
    if (!order || order.status !== "dibayar" || !order.autoReleaseAt) return;

    timerRef.current = setInterval(() => {
      const diff = new Date(order.autoReleaseAt!).getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(timerRef.current!);
        setMsLeft(0);
        // Reload untuk ambil status auto_lepas yang sudah diproses
        void loadOrder();
      } else {
        setMsLeft(diff);
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [order?.status, order?.autoReleaseAt]);

  // ── Auto-scroll ke bawah setiap ada pesan baru ───────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [order?.messages.length]);

  // ── Simpan & update order ─────────────────────────────────────────────────
  const saveAndSet = async (updated: P2POrder) => {
    await updateOrder(updated);
    setOrder({ ...updated });
  };

  const addMessages = async (
    current: P2POrder,
    msgs: Omit<P2POrder["messages"][number], "timestamp">[],
  ) => {
    const ts = new Date().toISOString();
    const full = msgs.map((m) => ({ ...m, timestamp: ts }));
    const updated = { ...current, messages: [...current.messages, ...full] };
    await saveAndSet(updated);
    return updated;
  };

  // ── Kirim pesan chat ──────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || !order) return;
    const from = order.myRole === "seller" ? "seller" : "buyer";
    const t = nowTime();
    await addMessages(order, [
      { id: `msg-${Date.now()}`, from, text: inputText.trim(), time: t },
    ]);
    setInputText("");
  };

  // ── PEMBELI: konfirmasi sudah bayar IDR ───────────────────────────────────
  const handleSudahBayar = async () => {
    if (!order || order.status !== "menunggu") return;
    const paidAt        = new Date().toISOString();
    const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_MS).toISOString();
    const t = nowTime();

    const updated: P2POrder = {
      ...order,
      status: "dibayar",
      paidAt,
      autoReleaseAt,
    };

    await addMessages(updated, [
      {
        id: `paid-confirm-${Date.now()}`,
        from: "buyer",
        text: "Saya sudah melakukan transfer sesuai jumlah yang tertera. Mohon segera dikonfirmasi. 🙏",
        time: t,
      },
      {
        id: `sys-paid-${Date.now() + 1}`,
        from: "system",
        text: `📢 SISTEM: Pembeli telah mengkonfirmasi pembayaran Rp ${order.idrAmount.toLocaleString("id-ID")}. Penjual diminta segera memeriksa rekening dan menekan "Lepas Aset".`,
        time: t,
        isEscrow: true,
      },
      {
        id: `sys-timer-${Date.now() + 2}`,
        from: "system",
        text: `⏰ Penjual memiliki waktu 24 jam untuk melepas aset. Jika tidak merespons, sistem akan otomatis melepas aset ke pembeli dan akun penjual ditangguhkan 72 jam.`,
        time: t,
        isWarning: true,
      },
    ]);

    setMsLeft(AUTO_RELEASE_MS);

    Animated.sequence([
      Animated.timing(warningAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.timing(warningAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  // ── PENJUAL (sebagai exchanger): konfirmasi sudah bayar IDR ke penjual ────
  // Digunakan ketika user beli iklan "beli" (user menjual aset ke exchanger)
  // Admin/exchanger klik ini setelah transfer IDR ke rekening customer
  const handleKonfirmasiSudahBayarIDR = async () => {
    if (!order || order.status !== "menunggu") return;
    const paidAt        = new Date().toISOString();
    const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_MS).toISOString();
    const t = nowTime();

    const updated: P2POrder = { ...order, status: "dibayar", paidAt, autoReleaseAt };

    await addMessages(updated, [
      {
        id: `adm-paid-${Date.now()}`,
        from: "seller",
        text: `Pembayaran IDR Rp ${order.idrAmount.toLocaleString("id-ID")} sudah kami transfer ke rekening kamu via ${order.paymentMethod}. Silakan cek dan lepas asetmu. 🙏`,
        time: t,
      },
      {
        id: `sys-adm-${Date.now() + 1}`,
        from: "system",
        text: `📢 SISTEM: Admin telah mengkonfirmasi pembayaran IDR. Kamu (penjual aset) diminta melepas ${order.assetAmount} ${order.asset} dalam 24 jam.`,
        time: t,
        isEscrow: true,
      },
      {
        id: `sys-timer2-${Date.now() + 2}`,
        from: "system",
        text: `⏰ Kamu memiliki waktu 24 jam untuk melepas aset. Jika tidak merespons, sistem akan otomatis melepas aset dan akun kamu ditangguhkan 72 jam.`,
        time: t,
        isWarning: true,
      },
    ]);

    setMsLeft(AUTO_RELEASE_MS);
  };

  // ── PEMILIK ASET: lepas aset setelah menerima pembayaran ─────────────────
  // Buyer flow: seller lepas aset ke buyer
  // Seller flow: customer (seller) lepas aset ke admin
  const handleLepasAset = () => {
    if (!order) return;
    const idrFmt    = `Rp ${order.idrAmount.toLocaleString("id-ID")}`;
    const assetFmt  = `${order.assetAmount} ${order.asset}`;

    Alert.alert(
      "Lepas Aset?",
      `Pastikan kamu sudah menerima pembayaran ${idrFmt} sebelum melepas aset.\n\nMenekan "Ya, Lepas Aset" akan mengirim ${assetFmt} secara permanen dan tidak bisa dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Lepas Aset",
          onPress: async () => {
            if (!order) return;
            const t = nowTime();
            const updated: P2POrder = {
              ...order,
              status: "selesai",
              releasedAt: new Date().toISOString(),
            };
            await addMessages(updated, [
              {
                id: `rel-msg-${Date.now()}`,
                from: order.myRole === "buyer" ? "seller" : "buyer",
                text: "Pembayaran sudah saya terima dengan baik. Aset saya lepas sekarang. Terima kasih! 🎉",
                time: t,
              },
              {
                id: `sys-rel-${Date.now() + 1}`,
                from: "system",
                text: `✅ SISTEM: ${assetFmt} berhasil dilepaskan. Transaksi selesai dengan aman. Terima kasih telah bertransaksi di GarudaChain P2P.`,
                time: t,
                isEscrow: true,
              },
            ]);
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeout(() => {
              Alert.alert(
                "Transaksi Berhasil! 🎉",
                order.myRole === "buyer"
                  ? `${assetFmt} telah masuk ke dompet kamu.`
                  : `Aset ${assetFmt} berhasil dilepaskan ke pembeli.`,
                [{ text: "Selesai", onPress: () => router.back() }]
              );
            }, 400);
          },
        },
      ]
    );
  };

  // ── Batalkan order (hanya jika belum bayar) ───────────────────────────────
  const handleCancel = () => {
    if (!order) return;
    if (order.status !== "menunggu") {
      Alert.alert("Tidak Bisa Dibatalkan", "Order yang sudah dikonfirmasi pembayarannya tidak bisa dibatalkan. Hubungi dukungan jika ada masalah.");
      return;
    }
    Alert.alert(
      "Batalkan Order?",
      "Aset dalam escrow akan dikembalikan ke penjual.",
      [
        { text: "Tidak", style: "cancel" },
        {
          text: "Ya, Batalkan",
          style: "destructive",
          onPress: async () => {
            const t = nowTime();
            const updated: P2POrder = { ...order, status: "dibatalkan" };
            await addMessages(updated, [{
              id: `cancel-${Date.now()}`,
              from: "system",
              text: "❌ Order dibatalkan. Aset dikembalikan ke escrow penjual.",
              time: t,
              isWarning: true,
            }]);
            router.back();
          },
        },
      ]
    );
  };

  // ── Derived UI values ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={NEO_ACCENT} size="large" />
        <Text style={{ marginTop: 12, color: NEO_MUTED, fontFamily: "Inter_400Regular" }}>Memuat order...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={NEO_MUTED} />
        <Text style={{ marginTop: 12, color: NEO_MUTED, fontFamily: "Inter_400Regular", textAlign: "center" }}>
          Order tidak ditemukan. Mungkin sudah dihapus atau belum dibuat.
        </Text>
        <TouchableOpacity
          style={[{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }, neoRaisedMd]}
          onPress={() => router.back()}
        >
          <Text style={{ color: NEO_ACCENT, fontFamily: "Inter_600SemiBold" }}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status    = order.status;
  const isBuyer   = order.myRole === "buyer";
  // Siapa yang pegang aset → harus lepas setelah pembayaran dikonfirmasi
  // buyer flow: penjual (trader) yang pegang aset
  // seller flow: customer (myRole=seller) yang pegang aset
  const iAssetHolder = !isBuyer; // jika myRole=seller → saya yang pegang aset

  const idrDisplay   = `Rp ${order.idrAmount.toLocaleString("id-ID")}`;
  const assetDisplay = `${order.assetAmount} ${order.asset}`;
  const orderId6     = order.id.slice(-6).toUpperCase();

  const statusColor =
    status === "menunggu"   ? "#F59E0B" :
    status === "dibayar"    ? "#3B82F6" :
    status === "selesai"    ? "#22C55E" :
    status === "auto_lepas" ? "#22C55E" :
    status === "dibatalkan" ? "#EF4444" : "#EF4444";

  const statusLabel =
    status === "menunggu"   ? "Menunggu Pembayaran" :
    status === "dibayar"    ? "Menunggu Lepas Aset" :
    status === "selesai"    ? "✅ Selesai" :
    status === "auto_lepas" ? "✅ Auto-Release" :
    status === "dibatalkan" ? "Dibatalkan" : "Sengketa";

  const trackerIdx =
    status === "menunggu"   ? 0 :
    status === "dibayar"    ? 1 : 2;

  const isDone = status === "selesai" || status === "auto_lepas" || status === "dibatalkan";

  const countdownColor = msLeft > 6 * 3600 * 1000 ? "#F59E0B" : "#EF4444"; // kuning > 6 jam, merah ≤ 6 jam

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NEO_BG }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, backgroundColor: NEO_BG }}>

        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerIconBtn, neoRaisedMd]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={20} color={NEO_TEXT} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{order.traderName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleCancel}
            style={[styles.headerIconBtn, neoRaisedMd]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close"
              size={18}
              color={status !== "menunggu" ? NEO_MUTED : "#EF4444"}
            />
          </TouchableOpacity>
        </View>

        {/* ── Order info strip ── */}
        <View style={[styles.orderStrip, neoInset]}>
          {[
            { label: "ID", value: `#${orderId6}` },
            { label: "Aset", value: order.asset },
            { label: "Jumlah", value: assetDisplay },
            { label: "Total", value: idrDisplay, accent: true },
          ].map((item, i, arr) => (
            <React.Fragment key={item.label}>
              <View style={styles.orderInfoItem}>
                <Text style={styles.orderInfoLabel}>{item.label}</Text>
                <Text style={[styles.orderInfoValue, item.accent && { color: NEO_ACCENT }]}>
                  {item.value}
                </Text>
              </View>
              {i < arr.length - 1 && <View style={styles.orderInfoDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── Status tracker ── */}
        <View style={[styles.trackerWrap, neoRaisedMd]}>
          {STATUS_STEPS.map((step, i) => {
            const done   = i < trackerIdx;
            const active = i === trackerIdx && !isDone;
            const final  = isDone && i === 2;
            return (
              <React.Fragment key={step.key}>
                <View style={styles.trackerStep}>
                  <View style={[
                    styles.trackerDot,
                    done  && { backgroundColor: "#22C55E" },
                    active && { backgroundColor: statusColor, borderColor: statusColor + "44", borderWidth: 3 },
                    final  && { backgroundColor: "#22C55E" },
                  ]}>
                    {(done || final) && <Ionicons name="checkmark" size={11} color="#fff" />}
                    {active && <View style={styles.trackerDotInner} />}
                  </View>
                  <Text style={[styles.trackerLabel, (done || active || final) && { color: NEO_TEXT, fontFamily: "Inter_600SemiBold" }]}>
                    {step.label}
                  </Text>
                </View>
                {i < STATUS_STEPS.length - 1 && (
                  <View style={[styles.trackerLine, i < trackerIdx && { backgroundColor: "#22C55E" }]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* ── Kartu Rekening Tujuan (buyer saat menunggu) ── */}
        {isBuyer && status === "menunggu" && order.paymentNoRek && (
          <View style={[styles.payInfoCard, { marginHorizontal: 20, marginBottom: 6 }]}>
            <View style={styles.payInfoHeader}>
              <Ionicons name="card" size={14} color={NEO_ACCENT} />
              <Text style={styles.payInfoTitle}>Transfer ke Rekening Berikut</Text>
            </View>
            {/* Bank/method */}
            <View style={styles.payInfoRow}>
              <Text style={styles.payInfoLabel}>Bank / E-Wallet</Text>
              <Text style={styles.payInfoValue}>{order.paymentMethod}</Text>
            </View>
            {/* Nomor rekening */}
            <View style={styles.payInfoRow}>
              <Text style={styles.payInfoLabel}>Nomor Rekening</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.payInfoValueBig}>{order.paymentNoRek}</Text>
                <TouchableOpacity
                  style={[styles.payInfoCopyBtn, copiedKey === "norek" && { backgroundColor: "#22C55E18" }]}
                  onPress={() => void copyText(order.paymentNoRek, "norek")}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={copiedKey === "norek" ? "checkmark" : "copy-outline"}
                    size={13}
                    color={copiedKey === "norek" ? "#22C55E" : NEO_ACCENT}
                  />
                  <Text style={[styles.payInfoCopyText, copiedKey === "norek" && { color: "#22C55E" }]}>
                    {copiedKey === "norek" ? "Disalin!" : "Salin"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Nama pemilik */}
            <View style={styles.payInfoRow}>
              <Text style={styles.payInfoLabel}>Nama Pemilik</Text>
              <Text style={styles.payInfoValue}>{order.paymentNama}</Text>
            </View>
            {/* Jumlah transfer */}
            <View style={[styles.payInfoRow, { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: 10, marginTop: 2 }]}>
              <Text style={styles.payInfoLabel}>Jumlah Transfer</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.payInfoValueBig, { color: NEO_ACCENT }]}>
                  Rp {order.idrAmount.toLocaleString("id-ID")}
                </Text>
                <TouchableOpacity
                  style={[styles.payInfoCopyBtn, copiedKey === "idr" && { backgroundColor: "#22C55E18" }]}
                  onPress={() => void copyText(String(order.idrAmount), "idr")}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={copiedKey === "idr" ? "checkmark" : "copy-outline"}
                    size={13}
                    color={copiedKey === "idr" ? "#22C55E" : NEO_ACCENT}
                  />
                  <Text style={[styles.payInfoCopyText, copiedKey === "idr" && { color: "#22C55E" }]}>
                    {copiedKey === "idr" ? "Disalin!" : "Salin"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.payInfoWarning}>
              ⚠️ Kosongkan kolom berita/catatan saat transfer
            </Text>
          </View>
        )}

        {/* ── Notifikasi dana terkirim (khusus seller/customer yang menjual) ── */}
        {iAssetHolder && status === "dibayar" && (
          <View style={styles.idrSentBanner}>
            <Ionicons name="cash" size={18} color="#16A34A" />
            <View style={{ flex: 1 }}>
              <Text style={styles.idrSentTitle}>
                💰 Dana IDR Rp {order.idrAmount.toLocaleString("id-ID")} sudah dikirim ke rekening kamu via {order.paymentMethod}.
              </Text>
              <Text style={styles.idrSentSub}>
                Mohon segera lepas asetmu sebelum batas waktu habis!
              </Text>
            </View>
          </View>
        )}

        {/* ── Countdown 24 jam (muncul saat status=dibayar) ── */}
        {status === "dibayar" && (
          <Animated.View style={[styles.countdownBanner, { backgroundColor: countdownColor + "18" }]}>
            <Ionicons name="timer-outline" size={16} color={countdownColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.countdownTitle, { color: countdownColor }]}>
                {iAssetHolder
                  ? "Lepas aset sebelum batas waktu habis:"
                  : "Penjual harus melepas aset dalam:"}
              </Text>
              <Text style={[styles.countdownTimer, { color: countdownColor }]}>
                {formatCountdown(msLeft)}
              </Text>
              <Text style={[styles.countdownSub, { color: countdownColor }]}>
                Jika tidak dilepas, sistem akan auto-release dan akun ditangguhkan 72 jam
              </Text>
            </View>
            <View style={[styles.countdownBadge, { backgroundColor: countdownColor + "22" }]}>
              <Text style={[styles.countdownBadgeText, { color: countdownColor }]}>ESCROW</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Auto-release banner ── */}
        {(status === "auto_lepas" || autoReleased) && (
          <View style={[styles.countdownBanner, { backgroundColor: "#22C55E18" }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
            <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#16A34A" }}>
              Aset otomatis dilepas setelah 24 jam. Akun pihak yang tidak merespons ditangguhkan 72 jam.
            </Text>
          </View>
        )}

        {/* ── Pesan ── */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {order.messages.map((msg) => {
            if (msg.from === "system") {
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.systemMsgWrap,
                    msg.isWarning && styles.systemMsgWrapWarning,
                    msg.isEscrow  && styles.systemMsgWrapEscrow,
                  ]}
                >
                  <Text style={[
                    styles.systemMsg,
                    msg.isWarning && styles.systemMsgWarning,
                    msg.isEscrow  && styles.systemMsgEscrow,
                  ]}>
                    {msg.text}
                  </Text>
                </View>
              );
            }
            // Saya selalu di kanan
            const isMe = isBuyer ? msg.from === "buyer" : msg.from === "seller";
            const avatarChar = isMe ? "" : order.traderName[0];
            return (
              <View key={msg.id} style={[styles.bubbleRow, isMe && styles.bubbleRowRight]}>
                {!isMe && avatarChar && (
                  <View style={styles.traderAvatar}>
                    <Text style={styles.traderAvatarText}>{avatarChar}</Text>
                  </View>
                )}
                <View style={[styles.bubble, isMe ? styles.bubbleMine : styles.bubbleTheir]}>
                  <Text style={[styles.bubbleText, isMe && { color: "#fff" }]}>{msg.text}</Text>
                  <Text style={[styles.bubbleTime, isMe && { color: "rgba(255,255,255,0.6)" }]}>
                    {msg.time}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* ── Bottom action area ── */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 8 }]}>

          {/* BUYER: Saya Sudah Bayar IDR */}
          {isBuyer && status === "menunggu" && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#22C55E" }]}
              onPress={handleSudahBayar}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Saya Sudah Bayar</Text>
            </TouchableOpacity>
          )}

          {/* SELLER (admin/exchanger): Konfirmasi sudah bayar IDR ke penjual */}
          {!isBuyer && status === "menunggu" && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#3B82F6" }]}
              onPress={handleKonfirmasiSudahBayarIDR}
              activeOpacity={0.85}
            >
              <Ionicons name="card-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Konfirmasi Sudah Bayar IDR ke Penjual</Text>
            </TouchableOpacity>
          )}

          {/* Pemilik aset: Lepas Aset */}
          {iAssetHolder && status === "dibayar" && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: NEO_ACCENT }]}
              onPress={handleLepasAset}
              activeOpacity={0.85}
            >
              <Ionicons name="lock-open-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Lepas Aset ke Pembeli</Text>
            </TouchableOpacity>
          )}

          {/* Pembeli menunggu penjual lepas */}
          {isBuyer && status === "dibayar" && (
            <View style={[styles.waitingBanner]}>
              <Ionicons name="hourglass-outline" size={16} color="#3B82F6" />
              <Text style={styles.waitingText}>
                Menunggu penjual melepas aset... Countdown berjalan.
              </Text>
            </View>
          )}

          {/* Selesai */}
          {(status === "selesai" || status === "auto_lepas") && (
            <View style={[styles.doneBanner]}>
              <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              <Text style={styles.doneText}>
                {status === "auto_lepas"
                  ? "Aset dilepas otomatis oleh sistem setelah 24 jam"
                  : "Transaksi selesai — Aset telah dikirim"}
              </Text>
            </View>
          )}

          {/* Dibatalkan */}
          {status === "dibatalkan" && (
            <View style={[styles.doneBanner, { backgroundColor: "#EF444412" }]}>
              <Ionicons name="close-circle" size={18} color="#EF4444" />
              <Text style={[styles.doneText, { color: "#EF4444" }]}>Order dibatalkan</Text>
            </View>
          )}

          {/* Chat input */}
          {!isDone && (
            <View style={[styles.inputRow, neoRaisedMd]}>
              <TextInput
                style={styles.chatInput}
                placeholder="Tulis pesan..."
                placeholderTextColor={NEO_MUTED}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => void sendMessage()}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { opacity: inputText.trim() ? 1 : 0.4 }]}
                onPress={() => void sendMessage()}
                disabled={!inputText.trim()}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12, backgroundColor: NEO_BG, gap: 12,
  },
  headerIconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG, alignItems: "center", justifyContent: "center" },
  headerCenter:  { flex: 1, alignItems: "center", gap: 4 },
  headerTitle:   { fontSize: 15, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  statusBadge:   { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  orderStrip: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: NEO_BG, marginBottom: 10,
  },
  orderInfoItem:   { flex: 1, alignItems: "center" },
  orderInfoLabel:  { fontSize: 9, fontFamily: "Inter_400Regular", color: NEO_MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  orderInfoValue:  { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  orderInfoDivider: { width: 1, height: 24, backgroundColor: "rgba(0,0,0,0.08)" },

  trackerWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: NEO_BG, marginBottom: 8,
  },
  trackerStep:    { alignItems: "center", gap: 5, flex: 1 },
  trackerDot:     { width: 22, height: 22, borderRadius: 11, backgroundColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  trackerDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  trackerLine:    { flex: 1, height: 2, backgroundColor: "#D1D5DB", marginBottom: 20 },
  trackerLabel:   { fontSize: 9, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", lineHeight: 12 },

  countdownBanner: {
    marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 6,
  },
  countdownTitle:  { fontSize: 11, fontFamily: "Inter_500Medium" },
  countdownTimer:  { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2, letterSpacing: 1 },
  countdownSub:    { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2, opacity: 0.8 },
  countdownBadge:  { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" },
  countdownBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  messageList: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 10 },
  systemMsgWrap: {
    alignSelf: "center", backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, maxWidth: "92%",
  },
  systemMsgWrapWarning: { backgroundColor: "#F59E0B18" },
  systemMsgWrapEscrow:  { backgroundColor: "#22C55E12" },
  systemMsg:        { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", lineHeight: 16 },
  systemMsgWarning: { color: "#D97706" },
  systemMsgEscrow:  { color: "#16A34A" },

  bubbleRow:      { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowRight: { flexDirection: "row-reverse" },
  traderAvatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: "#3B82F622", alignItems: "center", justifyContent: "center" },
  traderAvatarText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#3B82F6" },
  bubble:        { maxWidth: "75%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleTheir:   { backgroundColor: "#F0F0F3", borderBottomLeftRadius: 4 },
  bubbleMine:    { backgroundColor: NEO_ACCENT, borderBottomRightRadius: 4 },
  bubbleText:    { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 18 },
  bubbleTime:    { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED, alignSelf: "flex-end" },

  bottomArea: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: NEO_BG, gap: 8 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },

  waitingBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#3B82F612", borderRadius: 12, padding: 12,
  },
  waitingText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#3B82F6" },

  idrSentBanner: {
    marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 6,
    backgroundColor: "#22C55E20", borderWidth: 1, borderColor: "#22C55E40",
  },
  idrSentTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#15803D", lineHeight: 18 },
  idrSentSub:   { fontSize: 12, fontFamily: "Inter_400Regular", color: "#16A34A", marginTop: 4 },

  doneBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#22C55E12", borderRadius: 12, padding: 12,
  },
  doneText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#22C55E" },

  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    backgroundColor: NEO_BG, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6,
  },
  chatInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, maxHeight: 80, paddingVertical: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: NEO_ACCENT, alignItems: "center", justifyContent: "center" },

  payInfoCard: {
    backgroundColor: NEO_BG, borderRadius: 14,
    borderWidth: 1, borderColor: NEO_ACCENT + "30",
    overflow: "hidden",
  },
  payInfoHeader: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: NEO_ACCENT + "10",
    borderBottomWidth: 1, borderBottomColor: NEO_ACCENT + "20",
  },
  payInfoTitle:   { fontSize: 12, fontFamily: "Inter_700Bold", color: NEO_ACCENT, textTransform: "uppercase", letterSpacing: 0.4 },
  payInfoRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 9 },
  payInfoLabel:   { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  payInfoValue:   { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
  payInfoValueBig: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT, letterSpacing: 0.5 },
  payInfoCopyBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: NEO_ACCENT + "15" },
  payInfoCopyText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: NEO_ACCENT },
  payInfoWarning: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#D97706", paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2 },
});
