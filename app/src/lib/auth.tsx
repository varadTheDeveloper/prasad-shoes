import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAuthErrorListener } from './api';
import { getToken, setToken } from './storage';
import { hasPermission, type Permission } from '@shared/permissions';
import type { Me } from '@shared/types';

interface AuthState {
  me: Me | null;
  ready: boolean;
  login: (mobile: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const logout = useCallback(async () => {
    await setToken(null);
    setMe(null);
    qc.clear();
  }, [qc]);

  const refresh = useCallback(async () => {
    if (!(await getToken())) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>('GET', '/me'));
    } catch (e: any) {
      if (e?.status === 401) await logout();
    }
  }, [logout]);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  // Permissions can change at any time: re-read them whenever the app comes back to the front.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    setAuthErrorListener((e) => {
      if (e.status === 401) {
        logout();
      } else if (e.code === 'PASSWORD_CHANGE_REQUIRED') {
        setMe((m) => (m ? { ...m, mustChangePassword: true } : m));
        router.replace('/change-password');
      }
    });
  }, [logout]);

  const login = useCallback(async (mobile: string, password: string) => {
    const r = await api<{ token: string; user: Me }>('POST', '/auth/login', { mobile, password });
    await setToken(r.token);
    setMe(r.user);
    return r.user;
  }, []);

  const value = useMemo(() => ({ me, ready, login, logout, refresh }), [me, ready, login, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Hide buttons the user may not use. The server checks again on every request. */
export function usePermission(code: Permission): boolean {
  const { me } = useAuth();
  return hasPermission(me, code);
}

export function useIsAdmin(): boolean {
  return useAuth().me?.role === 'ADMIN';
}
