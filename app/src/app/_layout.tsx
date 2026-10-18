import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loading } from '@/components/ui';
import { C } from '@/lib/theme';

function Gate() {
  const { me, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ground, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.ground } }}>
      <Stack.Protected guard={!me}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!me}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="labels" />
        <Stack.Screen name="staff/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (n, e: any) => n < 2 && !(e?.status >= 400 && e?.status < 500), staleTime: 10_000, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
