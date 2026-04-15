import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  NEO_BG, NEO_TEXT, NEO_MUTED, NEO_ACCENT,
  neoRaisedMd,
} from "@/constants/neo";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const FAQ = [
  {
    q: "Apa itu GarudaChain?",
    a: "GarudaChain adalah dompet kripto digital buatan Indonesia yang aman, cepat, dan mudah digunakan. Anda dapat menyimpan, mengirim, menerima, dan menukar aset kripto seperti Bitcoin, Ethereum, dan USDT.",
  },
  {
    q: "Apakah frasa pemulihan saya aman?",
    a: "Frasa pemulihan Anda disimpan hanya di perangkat Anda dan tidak pernah dikirim ke server kami. Pastikan Anda menyimpannya di tempat yang aman dan tidak membagikannya kepada siapapun, termasuk tim GarudaChain.",
  },
  {
    q: "Bagaimana cara menggunakan P2P?",
    a: "Di tab P2P, Anda dapat membeli dan menjual kripto langsung ke sesama pengguna. Pilih iklan yang tersedia, masukkan jumlah, pilih metode pembayaran, lalu konfirmasi. Pembayaran dijamin oleh sistem escrow GarudaChain.",
  },
  {
    q: "Berapa biaya transaksi?",
    a: "Biaya jaringan bervariasi tergantung aset dan kondisi jaringan. Pembelian kripto dikenai biaya layanan 1,5%. Transaksi P2P tidak dikenai biaya tambahan dari platform.",
  },
  {
    q: "Apa yang terjadi jika saya lupa PIN?",
    a: "Jika Anda lupa PIN, Anda dapat memulihkan dompet menggunakan Frasa Pemulihan Rahasia (24 kata). Pilih 'Impor Dompet' di halaman awal dan masukkan frasa Anda.",
  },
  {
    q: "Berapa lama transfer dikonfirmasi?",
    a: "Konfirmasi Bitcoin biasanya memakan waktu 10-60 menit. Ethereum sekitar 1-5 menit. Tether (USDT) di jaringan Tron bisa kurang dari 1 menit.",
  },
  {
    q: "Apakah GarudaChain terdaftar resmi?",
    a: "GarudaChain beroperasi sesuai regulasi Otoritas Jasa Keuangan (OJK) dan Badan Pengawas Perdagangan Berjangka Komoditi (Bappebti) Republik Indonesia.",
  },
  {
    q: "Bagaimana cara menghubungi dukungan?",
    a: "Anda dapat menghubungi tim dukungan kami melalui tombol 'Hubungi Dukungan' di bawah, atau email ke support@garudachain.org. Tim kami siap membantu 24/7.",
  },
];

const QUICK_LINKS = [
  { icon: "book-outline" as IoniconName, label: "Panduan Pengguna", color: "#627EEA" },
  { icon: "videocam-outline" as IoniconName, label: "Video Tutorial", color: "#22C55E" },
  { icon: "newspaper-outline" as IoniconName, label: "Blog & Berita", color: "#C8922A" },
  { icon: "shield-checkmark-outline" as IoniconName, label: "Kebijakan Privasi", color: "#8492A6" },
];

export default function BantuanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
        <Text style={styles.headerTitle}>Bantuan & FAQ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, neoRaisedMd]}>
          <View style={styles.heroIcon}>
            <Ionicons name={"help-buoy-outline" as IoniconName} size={36} color={NEO_ACCENT} />
          </View>
          <Text style={styles.heroTitle}>Pusat Bantuan GarudaChain</Text>
          <Text style={styles.heroDesc}>
            Temukan jawaban atas pertanyaan Anda, atau hubungi tim kami yang siap membantu 24/7.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Tautan Cepat</Text>
        <View style={styles.quickGrid}>
          {QUICK_LINKS.map((ql) => (
            <TouchableOpacity key={ql.label} style={[styles.quickCard, neoRaisedMd]} activeOpacity={0.7}>
              <View style={[styles.quickIcon, { backgroundColor: ql.color + "20" }]}>
                <Ionicons name={ql.icon} size={22} color={ql.color} />
              </View>
              <Text style={styles.quickLabel}>{ql.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Pertanyaan Umum (FAQ)</Text>
        <View style={[styles.faqCard, neoRaisedMd]}>
          {FAQ.map((item, i) => (
            <View key={i} style={i > 0 ? styles.faqItemBorder : undefined}>
              <TouchableOpacity
                style={styles.faqQuestion}
                onPress={() => setOpenIndex(openIndex === i ? null : i)}
                activeOpacity={0.7}
              >
                <Text style={styles.faqQuestionText}>{item.q}</Text>
                <Ionicons
                  name={(openIndex === i ? "chevron-up" : "chevron-down") as IoniconName}
                  size={18}
                  color={NEO_MUTED}
                />
              </TouchableOpacity>
              {openIndex === i && (
                <View style={styles.faqAnswer}>
                  <Text style={styles.faqAnswerText}>{item.a}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Kontak Dukungan</Text>
        <View style={[styles.card, neoRaisedMd]}>
          <TouchableOpacity
            style={styles.contactRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL("https://wa.me/628112345678?text=Halo%20GarudaChain%2C%20saya%20butuh%20bantuan")}
          >
            <View style={[styles.contactIcon, { backgroundColor: "#22C55E20" }]}>
              <Ionicons name={"chatbubble-ellipses-outline" as IoniconName} size={20} color="#22C55E" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Live Chat</Text>
              <Text style={styles.contactDesc}>Respons rata-rata &lt; 2 menit</Text>
            </View>
            <View style={[styles.onlineBadge]}>
              <Text style={styles.onlineBadgeText}>Online</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.contactRow, styles.contactRowBorder]}
            activeOpacity={0.7}
            onPress={() => Linking.openURL("mailto:support@garudachain.org?subject=Bantuan%20GarudaChain")}
          >
            <View style={[styles.contactIcon, { backgroundColor: "#627EEA20" }]}>
              <Ionicons name={"mail-outline" as IoniconName} size={20} color="#627EEA" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactDesc}>support@garudachain.org</Text>
            </View>
            <Ionicons name={"chevron-forward" as IoniconName} size={18} color={NEO_MUTED} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.contactRow, styles.contactRowBorder]}
            activeOpacity={0.7}
            onPress={() => Linking.openURL("https://wa.me/628112345678")}
          >
            <View style={[styles.contactIcon, { backgroundColor: "#22C55E20" }]}>
              <Ionicons name={"logo-whatsapp" as IoniconName} size={20} color="#22C55E" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>WhatsApp</Text>
              <Text style={styles.contactDesc}>+62 811-2345-6789</Text>
            </View>
            <Ionicons name={"chevron-forward" as IoniconName} size={18} color={NEO_MUTED} />
          </TouchableOpacity>
        </View>

        <View style={[styles.versionCard, neoRaisedMd]}>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Versi Aplikasi</Text>
            <Text style={styles.versionValue}>2.1.0</Text>
          </View>
          <View style={[styles.versionRow, styles.versionRowBorder]}>
            <Text style={styles.versionLabel}>Terdaftar di</Text>
            <Text style={styles.versionValue}>OJK & Bappebti</Text>
          </View>
          <View style={[styles.versionRow, styles.versionRowBorder]}>
            <Text style={styles.versionLabel}>Dibuat dengan ❤ di</Text>
            <Text style={styles.versionValue}>Indonesia 🇮🇩</Text>
          </View>
        </View>
      </ScrollView>
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
  heroCard: {
    backgroundColor: NEO_BG, borderRadius: 24, padding: 24,
    alignItems: "center", gap: 10, marginBottom: 20,
  },
  heroIcon: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: NEO_ACCENT + "15",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  heroTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: NEO_TEXT, textAlign: "center" },
  heroDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED, textAlign: "center", lineHeight: 20 },
  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: NEO_MUTED,
    letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 12, marginTop: 4,
  },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  quickCard: {
    width: "47%", backgroundColor: NEO_BG, borderRadius: 16,
    alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, gap: 8,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: NEO_TEXT, textAlign: "center" },
  faqCard: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden", marginBottom: 20 },
  faqItemBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  faqQuestion: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  faqQuestionText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, lineHeight: 20 },
  faqAnswer: { paddingHorizontal: 14, paddingBottom: 14 },
  faqAnswerText: { fontSize: 13, fontFamily: "Inter_400Regular", color: NEO_MUTED, lineHeight: 20 },
  card: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden", marginBottom: 20 },
  contactRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  contactRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  contactIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  contactInfo: { flex: 1 },
  contactLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT, marginBottom: 2 },
  contactDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  onlineBadge: { backgroundColor: "#22C55E20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  onlineBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22C55E" },
  versionCard: { backgroundColor: NEO_BG, borderRadius: 20, overflow: "hidden" },
  versionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  versionRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  versionLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: NEO_MUTED },
  versionValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: NEO_TEXT },
});
