// Login token: Expo SecureStore on Android, localStorage on the website.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'ps_token';

export async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (token) globalThis.localStorage?.setItem(KEY, token);
      else globalThis.localStorage?.removeItem(KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // storage unavailable: the user just logs in again next time
  }
}

/** Small settings remembered on this device (e.g. Orders List / Table). */
export async function getPref(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(`ps_${key}`) ?? null;
    return await SecureStore.getItemAsync(`ps_${key}`);
  } catch {
    return null;
  }
}
export async function setPref(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(`ps_${key}`, value);
    else await SecureStore.setItemAsync(`ps_${key}`, value);
  } catch {
    // not remembered: fine
  }
}
