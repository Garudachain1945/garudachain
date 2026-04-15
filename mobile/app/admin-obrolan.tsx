import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
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
type TicketStatus = "aktif" | "selesai" | "eskalasi";
type FilterTab = "semua" | "aktif" | "selesai";

interface CustomerTicket {
  id: string;
  customer: string;
  avatar: string;
  asset: string;
  amount: string;
  idr: string;
  type: "beli" | "jual";
  status: TicketStatus;
  lastMsg: string;
  time: string;
  unread: number;
  messages: AdminMessage[];
}

interface AdminMessage {
  id: string;
  from: "customer" | "admin" | "system";
  text: string;
  time: string;
  senderName?: string;
}

const now = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

const INITIAL_TICKETS: CustomerTicket[] = [
  {
    id: "t1",
    customer: "RizkyTrade",
    avatar: "R",
    asset: "USDT",
    amount: "200 USDT",
    idr: "Rp 3.320.000",
    type: "jual",
    status: "aktif",
    lastMsg: "Transfer sudah saya lakukan, mohon segera dikonfirmasi.",
    time: "13:42",
    unread: 2,
    messages: [
      { id: "m1", from: "system", text: "Pesanan dibuat. ID #ORD-0081 · 200 USDT · Rp 3.320.000", time: "13:30", senderName: "Sistem" },
      { id: "m2", from: "customer", text: "Halo admin, saya sudah transfer ke rekening BCA ya.", time: "13:38", senderName: "RizkyTrade" },
      { id: "m3", from: "customer", text: "Transfer sudah saya lakukan, mohon segera dikonfirmasi.", time: "13:42", senderName: "RizkyTrade" },
    ],
  },
  {
    id: "t2",
    customer: "CryptoMaster99",
    avatar: "C",
    asset: "USDT",
    amount: "300 USDT",
    idr: "Rp 4.965.000",
    type: "beli",
    status: "aktif",
    lastMsg: "Baik, saya cek rekening dulu ya. Terima kasih 👍",
    time: "14:05",
    unread: 1,
    messages: [
      { id: "m1", from: "system", text: "Pesanan dibuat. ID #ORD-0082 · 300 USDT · Rp 4.965.000", time: "13:55", senderName: "Sistem" },
      { id: "m2", from: "customer", text: "Halo, saya mau beli 300 USDT. Bagaimana prosesnya?", time: "13:58", senderName: "CryptoMaster99" },
      { id: "m3", from: "admin", text: "Halo! Silakan lakukan transfer ke rekening yang tertera di detail pesanan. Setelah transfer, klik tombol Sudah Bayar.", time: "14:02", senderName: "Admin GarudaChain" },
      { id: "m4", from: "customer", text: "Baik, saya cek rekening dulu ya. Terima kasih 👍", time: "14:05", senderName: "CryptoMaster99" },
    ],
  },
  {
    id: "t3",
    customer: "IndraKripto",
    avatar: "I",
    asset: "USDT",
    amount: "50 USDT",
    idr: "Rp 830.000",
    type: "jual",
    status: "eskalasi",
    lastMsg: "Admin tolong bantu! Penjual tidak merespons sudah 2 jam.",
    time: "12:10",
    unread: 3,
    messages: [
      { id: "m1", from: "system", text: "Pesanan dibuat. ID #ORD-0079 · 50 USDT · Rp 830.000", time: "10:00", senderName: "Sistem" },
      { id: "m2", from: "customer", text: "Saya sudah transfer Rp 830.000 via GoPay.", time: "10:15", senderName: "IndraKripto" },
      { id: "m3", from: "system", text: "⚠️ Peringatan: Penjual belum merespons lebih dari 1 jam. Escrow berjalan.", time: "11:15", senderName: "Sistem" },
      { id: "m4", from: "customer", text: "Admin tolong bantu! Penjual tidak merespons sudah 2 jam.", time: "12:10", senderName: "IndraKripto" },
    ],
  },
  {
    id: "t4",
    customer: "FajarBTC",
    avatar: "F",
    asset: "BTC",
    amount: "0.003 BTC",
    idr: "Rp 4.944.000",
    type: "beli",
    status: "selesai",
    lastMsg: "Terima kasih, transaksi selesai! 🎉",
    time: "Kemarin",
    unread: 0,
    messages: [
      { id: "m1", from: "system", text: "Pesanan dibuat. ID #ORD-0075 · 0.003 BTC · Rp 4.944.000", time: "09:00", senderName: "Sistem" },
      { id: "m2", from: "customer", text: "Transfer sudah dilakukan.", time: "09:12", senderName: "FajarBTC" },
      { id: "m3", from: "admin", text: "Terima kasih! Aset sedang dalam proses pelepasan. Mohon tunggu sebentar.", time: "09:14", senderName: "Admin GarudaChain" },
      { id: "m4", from: "system", text: "✅ Aset telah dilepas ke pembeli. Transaksi selesai.", time: "09:20", senderName: "Sistem" },
      { id: "m5", from: "customer", text: "Terima kasih, transaksi selesai! 🎉", time: "09:21", senderName: "FajarBTC" },
    ],
  },
  {
    id: "t5",
    customer: "SatoshiFan",
    avatar: "S",
    asset: "ETH",
    amount: "0.05 ETH",
    idr: "Rp 2.755.000",
    type: "beli",
    status: "aktif",
    lastMsg: "Apakah bisa menggunakan Dana untuk transfer?",
    time: "14:30",
    unread: 1,
    messages: [
      { id: "m1", from: "system", text: "Pesanan dibuat. ID #ORD-0083 · 0.05 ETH · Rp 2.755.000", time: "14:25", senderName: "Sistem" },
      { id: "m2", from: "customer", text: "Apakah bisa menggunakan Dana untuk transfer?", time: "14:30", senderName: "SatoshiFan" },
    ],
  },
];

const STATUS_COLOR: Record<TicketStatus, string> = {
  aktif: "#22C55E",
  selesai: "#8A94A6",
  eskalasi: "#EF4444",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  aktif: "Aktif",
  selesai: "Selesai",
  eskalasi: "Eskalasi",
};

const FILTER_TABS: { key: FilterTab; label: string; icon: IoniconName }[] = [
  { key: "semua", label: "Semua", icon: "list" },
  { key: "aktif", label: "Aktif", icon: "chatbubbles" },
  { key: "selesai", label: "Selesai", icon: "checkmark-done" },
];

export default function AdminObrolanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { adminName = "Admin GarudaChain", adminUser = "admin" } = useLocalSearchParams<{
    adminName: string;
    adminUser: string;
  }>();

  const [tickets, setTickets] = useState<CustomerTicket[]>(INITIAL_TICKETS);
  const [filter, setFilter] = useState<FilterTab>("semua");
  const [activeTicket, setActiveTicket] = useState<CustomerTicket | null>(null);
  const [reply, setReply] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const sendAnim = useRef(new Animated.Value(1)).current;

  const filtered = tickets.filter((t) => {
    if (filter === "semua") return true;
    if (filter === "aktif") return t.status === "aktif" || t.status === "eskalasi";
    return t.status === "selesai";
  });

  const totalUnread = tickets.reduce((acc, t) => acc + t.unread, 0);

  const openTicket = (ticket: CustomerTicket) => {
    setActiveTicket(ticket);
    setTickets((prev) =>
      prev.map((t) => (t.id === ticket.id ? { ...t, unread: 0 } : t))
    );
  };

  const sendReply = () => {
    if (!reply.trim() || !activeTicket) return;

    const newMsg: AdminMessage = {
      id: `msg-${Date.now()}`,
      from: "admin",
      text: reply.trim(),
      time: now(),
      senderName: adminName as string,
    };

    const updatedTicket: CustomerTicket = {
      ...activeTicket,
      messages: [...activeTicket.messages, newMsg],
      lastMsg: reply.trim(),
      time: now(),
    };

    setTickets((prev) =>
      prev.map((t) => (t.id === activeTicket.id ? updatedTicket : t))
    );
    setActiveTicket(updatedTicket);
    setReply("");

    Animated.sequence([
      Animated.timing(sendAnim, { toValue: 0.9, duration: 80, useNativeDriver: false }),
      Animated.spring(sendAnim, { toValue: 1, useNativeDriver: false }),
    ]).start();

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const markDone = () => {
    if (!activeTicket) return;
    Alert.alert(
      "Selesaikan Tiket",
      `Tandai pesanan ${activeTicket.customer} sebagai selesai?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Selesaikan",
          style: "destructive",
          onPress: () => {
            const systemMsg: AdminMessage = {
              id: `sys-${Date.now()}`,
              from: "system",
              text: "✅ Tiket ditandai selesai oleh admin.",
              time: now(),
              senderName: "Sistem",
            };
            const updated: CustomerTicket = {
              ...activeTicket,
              status: "selesai",
              messages: [...activeTicket.messages, systemMsg],
            };
            setTickets((prev) => prev.map((t) => (t.id === activeTicket.id ? updated : t)));
            setActiveTicket(updated);
          },
        },
      ]
    );
  };

  const escalate = () => {
    if (!activeTicket) return;
    const systemMsg: AdminMessage = {
      id: `esc-${Date.now()}`,
      from: "system",
      text: "🚨 Tiket dieskalasi ke tim senior. Mohon tunggu penanganan lebih lanjut.",
      time: now(),
      senderName: "Sistem",
    };
    const updated: CustomerTicket = {
      ...activeTicket,
      status: "eskalasi",
      messages: [...activeTicket.messages, systemMsg],
    };
    setTickets((prev) => prev.map((t) => (t.id === activeTicket.id ? updated : t)));
    setActiveTicket(updated);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => {
    if (activeTicket) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }, [activeTicket]);

  /* ─────────── Chat detail view ─────────── */
  if (activeTicket) {
    const isDone = activeTicket.status === "selesai";
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: NEO_BG }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Chat header */}
        <View style={[cs.header, neoBottom, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={[cs.headerBack, neoRaisedMd]}
            onPress={() => setActiveTicket(null)}
          >
            <Ionicons name="chevron-back" size={20} color={NEO_TEXT} />
          </TouchableOpacity>

          <View style={cs.headerAvatar}>
            <Text style={cs.headerAvatarText}>{activeTicket.avatar}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={cs.headerName}>{activeTicket.customer}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[cs.statusDot, { backgroundColor: STATUS_COLOR[activeTicket.status] }]} />
              <Text style={cs.headerSub}>
                {activeTicket.asset} · {activeTicket.amount} · {STATUS_LABEL[activeTicket.status]}
              </Text>
            </View>
          </View>

          {!isDone && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[cs.headerAction, { backgroundColor: "#EF444418" }]}
                onPress={escalate}
                activeOpacity={0.8}
              >
                <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[cs.headerAction, { backgroundColor: "#22C55E18" }]}
                onPress={markDone}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-outline" size={18} color="#22C55E" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Order summary strip */}
        <View style={cs.orderStrip}>
          <View style={cs.orderStripItem}>
            <Text style={cs.orderStripLabel}>Aset</Text>
            <Text style={cs.orderStripValue}>{activeTicket.asset}</Text>
          </View>
          <View style={cs.orderStripDivider} />
          <View style={cs.orderStripItem}>
            <Text style={cs.orderStripLabel}>Jumlah</Text>
            <Text style={cs.orderStripValue}>{activeTicket.amount}</Text>
          </View>
          <View style={cs.orderStripDivider} />
          <View style={cs.orderStripItem}>
            <Text style={cs.orderStripLabel}>Total IDR</Text>
            <Text style={[cs.orderStripValue, { color: NEO_ACCENT }]}>{activeTicket.idr}</Text>
          </View>
          <View style={cs.orderStripDivider} />
          <View style={cs.orderStripItem}>
            <Text style={cs.orderStripLabel}>Tipe</Text>
            <Text style={[cs.orderStripValue, { color: activeTicket.type === "beli" ? "#22C55E" : "#EF4444" }]}>
              {activeTicket.type.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={cs.msgList}
          showsVerticalScrollIndicator={false}
        >
          {activeTicket.messages.map((msg) => {
            if (msg.from === "system") {
              return (
                <View key={msg.id} style={cs.sysMsgWrap}>
                  <View style={cs.sysMsg}>
                    <Text style={cs.sysMsgText}>{msg.text}</Text>
                    <Text style={cs.sysMsgTime}>{msg.time}</Text>
                  </View>
                </View>
              );
            }

            const isAdmin = msg.from === "admin";
            return (
              <View key={msg.id} style={[cs.msgRow, isAdmin && cs.msgRowAdmin]}>
                {!isAdmin && (
                  <View style={[cs.msgAvatar, { backgroundColor: "#3B82F618" }]}>
                    <Text style={[cs.msgAvatarText, { color: "#3B82F6" }]}>{activeTicket.avatar}</Text>
                  </View>
                )}
                <View style={{ maxWidth: "75%", gap: 3 }}>
                  <Text style={[cs.msgSender, isAdmin && { textAlign: "right", color: NEO_ACCENT }]}>
                    {msg.senderName}
                  </Text>
                  <View style={[cs.bubble, isAdmin ? cs.bubbleAdmin : cs.bubbleCustomer]}>
                    <Text style={[cs.bubbleText, isAdmin && { color: "#fff" }]}>{msg.text}</Text>
                  </View>
                  <Text style={[cs.msgTime, isAdmin && { textAlign: "right" }]}>{msg.time}</Text>
                </View>
                {isAdmin && (
                  <View style={[cs.msgAvatar, { backgroundColor: NEO_ACCENT + "22" }]}>
                    <Ionicons name="shield-checkmark" size={16} color={NEO_ACCENT} />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Input box */}
        {!isDone ? (
          <View style={[cs.inputBar, neoBottom, { paddingBottom: insets.bottom + 8 }]}>
            <View style={[cs.inputWrap, neoInset]}>
              <TextInput
                style={cs.input}
                placeholder="Tulis balasan sebagai admin..."
                placeholderTextColor={NEO_MUTED}
                value={reply}
                onChangeText={setReply}
                multiline
                maxLength={500}
              />
            </View>
            <Animated.View style={{ transform: [{ scale: sendAnim }] }}>
              <TouchableOpacity
                style={[cs.sendBtn, neoAccentBtn, !reply.trim() && { opacity: 0.45 }]}
                onPress={sendReply}
                disabled={!reply.trim()}
                activeOpacity={0.85}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : (
          <View style={[cs.doneBar, { paddingBottom: insets.bottom + 8 }]}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            <Text style={cs.doneBarText}>Tiket ini sudah selesai. Chat telah ditutup.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  /* ─────────── Ticket list view ─────────── */
  return (
    <View style={{ flex: 1, backgroundColor: NEO_BG }}>
      {/* Header */}
      <View style={[ls.header, neoBottom, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[ls.backBtn, neoRaisedMd]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color={NEO_TEXT} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={ls.title}>Kelola Chat Pelanggan</Text>
            {totalUnread > 0 && (
              <View style={ls.unreadBadge}>
                <Text style={ls.unreadBadgeText}>{totalUnread}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={[ls.adminDot, { backgroundColor: "#22C55E" }]} />
            <Text style={ls.adminName}>{adminName}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[ls.logoutBtn, neoRaisedMd]}
          onPress={() =>
            Alert.alert("Keluar Panel Admin", "Yakin ingin keluar?", [
              { text: "Batal", style: "cancel" },
              { text: "Keluar", style: "destructive", onPress: () => router.back() },
            ])
          }
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={ls.statsStrip}>
        {[
          { label: "Total Tiket", value: String(tickets.length), color: NEO_TEXT },
          { label: "Aktif", value: String(tickets.filter(t => t.status === "aktif").length), color: "#22C55E" },
          { label: "Eskalasi", value: String(tickets.filter(t => t.status === "eskalasi").length), color: "#EF4444" },
          { label: "Selesai", value: String(tickets.filter(t => t.status === "selesai").length), color: NEO_MUTED },
        ].map((stat, i) => (
          <View key={i} style={ls.statItem}>
            <Text style={[ls.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={ls.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter tabs */}
      <View style={ls.filterBar}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[ls.filterTab, filter === tab.key && ls.filterTabActive]}
            onPress={() => setFilter(tab.key)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={tab.icon}
              size={14}
              color={filter === tab.key ? NEO_ACCENT : NEO_MUTED}
            />
            <Text style={[ls.filterTabText, filter === tab.key && ls.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ticket list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={ls.ticketList}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 && (
          <View style={ls.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color={NEO_MUTED} />
            <Text style={ls.emptyText}>Tidak ada tiket di kategori ini.</Text>
          </View>
        )}
        {filtered.map((ticket) => (
          <TouchableOpacity
            key={ticket.id}
            style={[ls.ticketCard, neoRaisedMd, ticket.status === "eskalasi" && ls.ticketEscalated]}
            onPress={() => openTicket(ticket)}
            activeOpacity={0.85}
          >
            {/* Status bar left accent */}
            <View style={[ls.ticketAccent, { backgroundColor: STATUS_COLOR[ticket.status] }]} />

            <View style={[ls.ticketAvatar, { backgroundColor: STATUS_COLOR[ticket.status] + "22" }]}>
              <Text style={[ls.ticketAvatarText, { color: STATUS_COLOR[ticket.status] }]}>
                {ticket.avatar}
              </Text>
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <View style={ls.ticketRow}>
                <Text style={ls.ticketName}>{ticket.customer}</Text>
                <Text style={ls.ticketTime}>{ticket.time}</Text>
              </View>
              <View style={ls.ticketRow}>
                <Text style={ls.ticketMsg} numberOfLines={1}>{ticket.lastMsg}</Text>
                {ticket.unread > 0 && (
                  <View style={ls.unreadDot}>
                    <Text style={ls.unreadDotText}>{ticket.unread}</Text>
                  </View>
                )}
              </View>
              <View style={ls.ticketMeta}>
                <Text style={ls.metaChip}>
                  {ticket.asset} · {ticket.amount}
                </Text>
                <Text style={ls.metaChip}>{ticket.idr}</Text>
                <View style={[ls.statusBadge, { backgroundColor: STATUS_COLOR[ticket.status] + "22" }]}>
                  <Text style={[ls.statusBadgeText, { color: STATUS_COLOR[ticket.status] }]}>
                    {STATUS_LABEL[ticket.status]}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

/* ── Chat-detail styles ── */
const cs = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: NEO_BG,
    gap: 10,
  },
  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3B82F618",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#3B82F6" },
  headerName: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  headerAction: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  orderStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: NEO_BG,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  orderStripItem: { flex: 1, alignItems: "center", gap: 2 },
  orderStripLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  orderStripValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  orderStripDivider: { width: 1, height: 28, backgroundColor: "rgba(0,0,0,0.07)" },
  msgList: { padding: 16, gap: 14, paddingBottom: 24 },
  sysMsgWrap: { alignItems: "center" },
  sysMsg: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 2,
    alignItems: "center",
  },
  sysMsgText: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center" },
  sysMsgTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowAdmin: { flexDirection: "row-reverse" },
  msgAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  msgAvatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  msgSender: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#3B82F6" },
  bubble: { borderRadius: 18, padding: 12 },
  bubbleCustomer: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  bubbleAdmin: { backgroundColor: NEO_ACCENT, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT, lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    backgroundColor: NEO_BG,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: NEO_BG,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  input: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_TEXT },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: NEO_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "#22C55E0D",
    borderTopWidth: 1,
    borderTopColor: "#22C55E30",
  },
  doneBarText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
});

/* ── List styles ── */
const ls = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: NEO_BG,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: NEO_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  adminName: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  adminDot: { width: 7, height: 7, borderRadius: 4 },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#EF4444",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: NEO_BG,
    alignItems: "center", justifyContent: "center",
  },
  statsStrip: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    gap: 0,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  filterTabActive: { backgroundColor: NEO_ACCENT + "18" },
  filterTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: NEO_MUTED },
  filterTabTextActive: { color: NEO_ACCENT },
  ticketList: { padding: 16, gap: 12, paddingBottom: 32 },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  ticketCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NEO_BG,
    borderRadius: 20,
    padding: 14,
    gap: 12,
    overflow: "hidden",
  },
  ticketEscalated: {
    borderWidth: 1,
    borderColor: "#EF444420",
  },
  ticketAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderRadius: 4 },
  ticketAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  ticketAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  ticketRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  ticketName: { fontSize: 15, fontFamily: "Inter_700Bold", color: NEO_TEXT },
  ticketTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  ticketMsg: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaChip: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: NEO_MUTED,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  unreadDot: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: NEO_ACCENT,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  unreadDotText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
});
