import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useWalletSetup } from "@/context/WalletSetupContext";

function pickQuizIndices(): number[] {
  const all = Array.from({ length: 24 }, (_, i) => i);
  const shuffled = all.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 6).sort((a, b) => a - b);
}

function getChoices(correctWord: string, allWords: string[]): string[] {
  const pool = allWords.filter((w) => w !== correctWord);
  const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 2);
  return [correctWord, ...wrong].sort(() => Math.random() - 0.5);
}

export default function VerifikasiFrasaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mnemonic } = useWalletSetup();
  const words = useMemo(() => mnemonic ? mnemonic.split(" ") : [], [mnemonic]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const quizIndices = useMemo(() => pickQuizIndices(), []);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);

  const activeQuizIndex = quizIndices.find((idx) => answers[idx] === undefined) ?? null;

  const currentChoices = useMemo(() => {
    if (activeQuizIndex === null || words.length === 0) return [];
    return getChoices(words[activeQuizIndex], words);
  }, [activeQuizIndex, words]);

  const allAnswered = quizIndices.every((idx) => answers[idx] !== undefined);

  const handleChoice = (word: string) => {
    if (activeQuizIndex === null) return;
    if (word === words[activeQuizIndex]) {
      const newAnswers = { ...answers, [activeQuizIndex]: word };
      setAnswers(newAnswers);
      const isLast = quizIndices.every((idx) => newAnswers[idx] !== undefined);
      if (isLast) {
        setShowSuccess(true);
      }
    } else {
      setWrongFlash(word);
      setTimeout(() => setWrongFlash(null), 600);
    }
  };

  const handleDismissModal = () => {
    setShowSuccess(false);
    setModalDismissed(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        onRequestClose={handleDismissModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Sempurna!</Text>
            <Text style={[styles.modalMessage, { color: colors.mutedForeground }]}>
              Frasa pemulihan kamu berhasil diverifikasi. Jangan pernah membagikan frasa ini kepada siapa pun, termasuk tim dukungan kami.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#22c55e" }]}
              onPress={handleDismissModal}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>Mengerti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
          Konfirmasi Frasa{"\n"}Pemulihan Rahasia
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Pilih kata yang hilang dalam urutan yang benar.
        </Text>

        <View style={[styles.wordsGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {words.map((word: string, index: number) => {
            const isQuiz = quizIndices.includes(index);
            const isActive = index === activeQuizIndex;
            const isAnswered = answers[index] !== undefined;

            let cellStyle: object[] = [styles.wordCell, { borderColor: colors.border }];
            if (isActive) {
              cellStyle = [...cellStyle, { borderColor: colors.primary, backgroundColor: colors.background }];
            } else if (isAnswered) {
              cellStyle = [...cellStyle, { backgroundColor: "#C8922A", borderColor: "#C8922A" }];
            }

            return (
              <View key={index} style={cellStyle}>
                <Text
                  style={[
                    styles.wordNumber,
                    {
                      color: isAnswered
                        ? "rgba(255,255,255,0.45)"
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {index + 1}.
                </Text>
                {isAnswered ? (
                  <Text style={[styles.wordText, { color: "#ffffff" }]}>
                    {answers[index]}
                  </Text>
                ) : isQuiz ? (
                  <Text
                    style={[
                      styles.wordDots,
                      { color: isActive ? colors.foreground : colors.mutedForeground },
                    ]}
                  >
                    {isActive ? "" : "•••"}
                  </Text>
                ) : (
                  <Text style={[styles.wordDots, { color: colors.border }]}>
                    {"•".repeat(Math.min(word.length, 7))}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        {!allAnswered && activeQuizIndex !== null && (
          <View style={styles.choicesRow}>
            {currentChoices.map((choice) => {
              const isWrong = wrongFlash === choice;
              return (
                <TouchableOpacity
                  key={choice}
                  style={[
                    styles.choiceChip,
                    {
                      borderColor: isWrong ? "#ef4444" : colors.primary,
                      backgroundColor: isWrong ? "#fff0f0" : colors.background,
                    },
                  ]}
                  onPress={() => handleChoice(choice)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      { color: isWrong ? "#ef4444" : colors.primary },
                    ]}
                  >
                    {choice}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: modalDismissed ? "#C8922A" : colors.secondary },
          ]}
          activeOpacity={modalDismissed ? 0.8 : 1}
          disabled={!modalDismissed}
          onPress={() => modalDismissed && router.push("/izin-penggunaan")}
        >
          <Text
            style={[
              styles.continueButtonText,
              { color: modalDismissed ? "#ffffff" : colors.mutedForeground },
            ]}
          >
            Lanjutkan
          </Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 24,
  },
  wordsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "6px 6px 14px #D1D5DD, -6px -6px 14px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6 },
    }),
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
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  wordDots: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    letterSpacing: 1,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 16,
    gap: 16,
  },
  choicesRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  choiceChip: {
    flex: 1,
    height: 46,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: "#F0F0F3",
    ...Platform.select({
      web: { boxShadow: "4px 4px 10px #D1D5DD, -4px -4px 10px #FFFFFF" } as any,
      default: { shadowColor: "#C8D0DA", shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
    }),
  },
  choiceText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  modalBox: {
    width: "100%",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  modalIconWrap: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  modalButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
});
