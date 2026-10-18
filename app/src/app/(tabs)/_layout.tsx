import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuth, useIsAdmin, usePermission } from '@/lib/auth';
import { C } from '@/lib/theme';

const icon =
  (name: keyof typeof Feather.glyphMap) =>
  ({ color }: { color: unknown }) => <Feather name={name} size={22} color={color as string} />;

export default function TabsLayout() {
  const { me } = useAuth();
  const admin = useIsAdmin();
  const canCreate = usePermission('ORDER_CREATE');
  if (me?.mustChangePassword) return <Redirect href="/change-password" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.action,
        tabBarInactiveTintColor: '#475569',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border, minHeight: 64, paddingTop: 6 },
        sceneStyle: { backgroundColor: C.ground },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="new" options={{ title: admin ? 'New' : 'New order', tabBarIcon: icon('plus'), href: canCreate ? undefined : null }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('list') }} />
      <Tabs.Screen name="staff" options={{ title: 'Staff', tabBarIcon: icon('users'), href: admin ? undefined : null }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: icon('shopping-bag'), href: admin ? undefined : null }} />
    </Tabs>
  );
}
