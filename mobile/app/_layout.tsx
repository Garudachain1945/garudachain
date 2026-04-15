import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WalletSetupProvider } from "@/context/WalletSetupContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="buat-kata-sandi" options={{ headerShown: false }} />
      <Stack.Screen name="frasa-pemulihan" options={{ headerShown: false }} />
      <Stack.Screen name="impor-dompet" options={{ headerShown: false }} />
      <Stack.Screen name="verifikasi-frasa" options={{ headerShown: false }} />
      <Stack.Screen name="izin-penggunaan" options={{ headerShown: false }} />
      <Stack.Screen name="dompet-siap" options={{ headerShown: false }} />
      <Stack.Screen name="beranda" options={{ headerShown: false }} />
      <Stack.Screen name="kirim" options={{ headerShown: false }} />
      <Stack.Screen name="terima" options={{ headerShown: false }} />
      <Stack.Screen name="beli" options={{ headerShown: false }} />
      <Stack.Screen name="detail-aset" options={{ headerShown: false }} />
      <Stack.Screen name="p2p-buat-iklan" options={{ headerShown: false }} />
      <Stack.Screen name="p2p-order" options={{ headerShown: false }} />
      <Stack.Screen name="p2p-chat" options={{ headerShown: false }} />
      <Stack.Screen name="p2p-payment-select" options={{ headerShown: false }} />
      <Stack.Screen name="buat-akun" options={{ headerShown: false }} />
      <Stack.Screen name="unlock" options={{ headerShown: false }} />
      <Stack.Screen name="set-password-only" options={{ headerShown: false }} />
      <Stack.Screen name="impor-kunci-privat" options={{ headerShown: false }} />
      <Stack.Screen name="impor-akun-frasa" options={{ headerShown: false }} />
      <Stack.Screen name="admin-login" options={{ headerShown: false }} />
      <Stack.Screen name="admin-obrolan" options={{ headerShown: false }} />
      <Stack.Screen name="notifikasi" options={{ headerShown: false }} />
      <Stack.Screen name="profil" options={{ headerShown: false }} />
      <Stack.Screen name="keamanan" options={{ headerShown: false }} />
      <Stack.Screen name="bantuan" options={{ headerShown: false }} />
      <Stack.Screen name="buku-alamat" options={{ headerShown: false }} />
      <Stack.Screen name="pantau-alamat" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const inner = (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <WalletSetupProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </WalletSetupProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );

  return inner;
}
