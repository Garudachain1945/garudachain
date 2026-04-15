import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  Platform,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { hasWallet } from "@/utils/wallet-storage";

const rawWidth = Dimensions.get("window").width;
const width = Platform.OS === "web" ? 390 : rawWidth;

const TERMS_SECTIONS = [
  {
    title: "1. Penerimaan Ketentuan",
    body: "Dengan mengakses atau menggunakan aplikasi Dompet Digital (GarudaChain), Anda menyatakan telah membaca, memahami, dan menyetujui Syarat & Ketentuan ini. Jika Anda tidak menyetujui ketentuan ini, harap hentikan penggunaan aplikasi.",
  },
  {
    title: "2. Deskripsi Layanan",
    body: "Dompet Digital adalah aplikasi dompet aset kripto berbasis blockchain yang memungkinkan pengguna menyimpan, mengirim, menerima, dan menukar aset digital. Kami tidak menyediakan layanan keuangan konvensional dan bukan merupakan bank atau lembaga keuangan.",
  },
  {
    title: "3. Tanggung Jawab Pengguna",
    body: "Anda bertanggung jawab penuh atas:\n• Keamanan frasa pemulihan (seed phrase) dan kata sandi Anda.\n• Semua transaksi yang dilakukan dari dompet Anda.\n• Kepatuhan terhadap peraturan perpajakan dan hukum yang berlaku di wilayah hukum Anda.\n\nKami tidak dapat memulihkan akses ke dompet Anda jika frasa pemulihan hilang.",
  },
  {
    title: "4. Risiko Aset Digital",
    body: "Aset kripto bersifat volatil dan nilainya dapat berubah secara signifikan dalam waktu singkat. Pengguna memahami dan menerima bahwa:\n• Investasi aset digital mengandung risiko tinggi.\n• Kami tidak memberikan saran investasi.\n• Kami tidak bertanggung jawab atas kerugian akibat fluktuasi harga.",
  },
  {
    title: "5. Keamanan & Privasi",
    body: "Kami menggunakan enkripsi tingkat tinggi untuk melindungi data Anda. Kunci privat Anda disimpan secara lokal di perangkat dan tidak pernah dikirimkan ke server kami. Informasi penggunaan anonim dapat dikumpulkan untuk meningkatkan layanan, sesuai Kebijakan Privasi kami.",
  },
  {
    title: "6. Larangan Penggunaan",
    body: "Anda dilarang menggunakan Dompet Digital untuk:\n• Kegiatan ilegal atau pencucian uang.\n• Penipuan atau pemalsuan identitas.\n• Pelanggaran hak kekayaan intelektual pihak lain.\n• Aktivitas yang melanggar peraturan OJK atau hukum Indonesia.",
  },
  {
    title: "7. Pembaruan Ketentuan",
    body: "Kami berhak mengubah Syarat & Ketentuan ini sewaktu-waktu. Perubahan signifikan akan diberitahukan melalui notifikasi aplikasi. Penggunaan lanjutan setelah pemberitahuan berarti Anda menerima perubahan tersebut.",
  },
  {
    title: "8. Hukum yang Berlaku",
    body: "Syarat & Ketentuan ini diatur oleh hukum Republik Indonesia. Setiap perselisihan akan diselesaikan melalui mediasi atau arbitrase sesuai ketentuan BANI (Badan Arbitrase Nasional Indonesia).",
  },
  {
    title: "9. Hubungi Kami",
    body: "Jika Anda memiliki pertanyaan mengenai Syarat & Ketentuan ini, silakan hubungi kami melalui:\nEmail: support@garudachain.org\nWebsite: www.garudachain.org",
  },
];

function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false, damping: 18, stiffness: 220 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.93, duration: 150, useNativeDriver: false }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[termsStyles.overlay, { opacity: opacityAnim }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[termsStyles.card, { paddingBottom: bottomPad + 8, transform: [{ scale: scaleAnim }] }]}
        >
          {/* Golden header — matches welcome screen identity */}
          <View style={termsStyles.cardHeader}>
            <View style={termsStyles.headerLeft}>
              <Image
                source={require("../../assets/images/garuda.png")}
                style={termsStyles.headerGaruda}
                resizeMode="contain"
              />
              <View>
                <Text style={termsStyles.cardTitle}>Syarat & Ketentuan</Text>
                <Text style={termsStyles.cardSubtitle}>GarudaChain · Dompet Digital</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={termsStyles.closeBtn}
            >
              <Ionicons name="close" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Badge strip */}
          <View style={termsStyles.badge}>
            <Ionicons name="shield-checkmark" size={13} color="#C8922A" />
            <Text style={termsStyles.badgeText}>
              Berlaku sejak 1 Januari 2025 · Versi 2.1.0
            </Text>
          </View>

          <ScrollView
            style={termsStyles.scroll}
            contentContainerStyle={termsStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={termsStyles.intro}>
              Harap baca dengan seksama sebelum menggunakan layanan kami. Dokumen ini mengatur hubungan antara Anda dan GarudaChain.
            </Text>
            {TERMS_SECTIONS.map((sec, i) => (
              <View key={i} style={termsStyles.section}>
                <View style={termsStyles.sectionTitleRow}>
                  <View style={termsStyles.sectionDot} />
                  <Text style={termsStyles.sectionTitle}>{sec.title}</Text>
                </View>
                <Text style={termsStyles.sectionBody}>{sec.body}</Text>
              </View>
            ))}
            <View style={termsStyles.footerNote}>
              <Ionicons name="information-circle-outline" size={13} color="#aaa" />
              <Text style={termsStyles.footerNoteText}>Terakhir diperbarui 1 Januari 2025</Text>
            </View>
          </ScrollView>

          <View style={termsStyles.actions}>
            <TouchableOpacity style={termsStyles.agreeBtn} onPress={onClose} activeOpacity={0.82}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
              <Text style={termsStyles.agreeBtnText}>Saya Mengerti & Setuju</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={termsStyles.declineBtn} activeOpacity={0.7}>
              <Text style={termsStyles.declineBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function GoogleIcon() {
  return (
    <View style={sheetStyles.socialIconWrapper}>
      <Text style={sheetStyles.googleG}>G</Text>
    </View>
  );
}

function AppleIcon({ color }: { color: string }) {
  return (
    <Ionicons name="logo-apple" size={20} color={color} style={{ marginRight: 10 }} />
  );
}

function WalletSheet({
  visible,
  onClose,
  googleLabel,
  appleLabel,
  recoveryLabel,
  onRecovery,
}: {
  visible: boolean;
  onClose: () => void;
  googleLabel: string;
  appleLabel: string;
  recoveryLabel: string;
  onRecovery: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: false,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 220,
          useNativeDriver: false,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [visible]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[sheetStyles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          sheetStyles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: bottomPad + 16,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={sheetStyles.handle} />

        <View style={sheetStyles.sheetContent}>
          <TouchableOpacity
            style={[sheetStyles.socialButton, { borderColor: colors.border }]}
            activeOpacity={0.75}
          >
            <GoogleIcon />
            <Text style={[sheetStyles.socialButtonText, { color: colors.foreground }]}>
              {googleLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[sheetStyles.socialButton, { borderColor: colors.border }]}
            activeOpacity={0.75}
          >
            <AppleIcon color={colors.foreground} />
            <Text style={[sheetStyles.socialButtonText, { color: colors.foreground }]}>
              {appleLabel}
            </Text>
          </TouchableOpacity>

          <View style={sheetStyles.orRow}>
            <View style={[sheetStyles.orLine, { backgroundColor: colors.border }]} />
            <Text style={[sheetStyles.orText, { color: colors.mutedForeground }]}>atau</Text>
            <View style={[sheetStyles.orLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[sheetStyles.recoveryButton, { backgroundColor: colors.secondary }]}
            activeOpacity={0.75}
            onPress={onRecovery}
          >
            <Text style={[sheetStyles.recoveryButtonText, { color: colors.foreground }]}>
              {recoveryLabel}
            </Text>
          </TouchableOpacity>

          <Text style={[sheetStyles.termsText, { color: colors.mutedForeground }]}>
            Dengan melanjutkan, Anda menyetujui{" "}
            <Text style={{ color: colors.primary }}>Ketentuan penggunaan</Text>
            {" "}dan{"\n"}
            <Text style={{ color: colors.primary }}>Pemberitahuan privasi</Text>{" "}
            Dompet Digital
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [newWalletSheet, setNewWalletSheet] = useState(false);
  const [existingWalletSheet, setExistingWalletSheet] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Jika wallet sudah ada → arahkan ke layar unlock (login dengan password)
  useEffect(() => {
    void (async () => {
      const exists = await hasWallet();
      if (exists) router.replace("/unlock");
    })();
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: topPadding,
          paddingBottom: bottomPadding + 20,
        },
      ]}
    >
      <View style={styles.topSection}>
        <Image
          source={require("../../assets/images/garuda.png")}
          style={styles.garudaImage}
          resizeMode="contain"
        />
        <Text style={[styles.appTitle, { color: colors.primary }]}>
          Dompet Digital
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Bhinneka Tunggal Ika
        </Text>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.8}
          onPress={() => setNewWalletSheet(true)}
        >
          <Text style={[styles.primaryButtonText, { color: colors.foreground }]}>
            Buat dompet baru
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.8}
          onPress={() => setExistingWalletSheet(true)}
        >
          <Text style={[styles.secondaryButtonText, { color: "#ffffff" }]}>
            Saya sudah memiliki dompet
          </Text>
        </TouchableOpacity>

        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          Dengan melanjutkan, Anda menyetujui{"\n"}
          <Text
            style={{ color: colors.primary }}
            onPress={() => setShowTerms(true)}
          >
            Syarat & Ketentuan
          </Text>{" "}kami
        </Text>
      </View>

      {/* Sheet: Buat dompet baru */}
      <WalletSheet
        visible={newWalletSheet}
        onClose={() => setNewWalletSheet(false)}
        googleLabel="Lanjutkan dengan Google"
        appleLabel="Lanjutkan dengan Apple"
        recoveryLabel="Gunakan Frasa Pemulihan Rahasia"
        onRecovery={() => {
          setNewWalletSheet(false);
          router.push("/buat-kata-sandi");
        }}
      />

      {/* Sheet: Sudah memiliki dompet */}
      <WalletSheet
        visible={existingWalletSheet}
        onClose={() => setExistingWalletSheet(false)}
        googleLabel="Masuk dengan Google"
        appleLabel="Masuk dengan Apple"
        recoveryLabel="Impor menggunakan Frasa Pemulihan Rahasia"
        onRecovery={() => {
          setExistingWalletSheet(false);
          router.push("/impor-dompet");
        }}
      />

      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  topSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  garudaImage: {
    width: width * 0.65,
    height: width * 0.65,
    marginBottom: 24,
  },
  appTitle: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  bottomSection: {
    width: "100%",
    gap: 12,
    alignItems: "center",
  },
  primaryButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "6px 6px 14px #D1D5DD, -6px -6px 14px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6 },
    }),
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C8922A",
    ...Platform.select({
      web: { boxShadow: "4px 4px 10px #B07820, -2px -2px 6px #E0A840" } as any,
      default: { shadowColor: "#B07820", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
    }),
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d1d6",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  socialIconWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  googleG: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#4285F4",
    lineHeight: 22,
  },
  socialButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 2,
  },
  orLine: {
    flex: 1,
    height: 1,
  },
  orText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  recoveryButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  recoveryButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  termsText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
  },
});

const termsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxHeight: "88%",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 24,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerGaruda: {
    width: 44,
    height: 44,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#C8922A",
  },
  cardSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF8EE",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F0E0C0",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#C8922A",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  intro: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#555555",
    lineHeight: 20,
    marginBottom: 20,
    fontStyle: "italic",
    backgroundColor: "#F9F9F9",
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#C8922A",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C8922A",
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#1a1a1a",
  },
  sectionBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#555555",
    lineHeight: 21,
    paddingLeft: 14,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    paddingTop: 14,
    marginTop: 4,
  },
  footerNoteText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#aaaaaa",
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    backgroundColor: "#ffffff",
    gap: 8,
  },
  agreeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#C8922A",
  },
  agreeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
  declineBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  declineBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#999999",
  },
});
