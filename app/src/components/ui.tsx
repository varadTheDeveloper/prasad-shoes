import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, MAX_W, R } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

// ----------------------------------------------------------------- page frame
export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const { me } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 14 }]}>
      <View style={s.headerInner}>
        <Text style={s.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {right ?? (me ? <RoleBadge role={me.role} /> : null)}
      </View>
    </View>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <View style={s.roleBadge}>
      <Text style={s.roleBadgeText}>{role}</Text>
    </View>
  );
}

export function Page({
  title,
  children,
  footer,
  wide,
  scroll = true,
  right,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  scroll?: boolean;
  right?: ReactNode;
}) {
  const inner = <View style={[s.pageInner, { maxWidth: wide ? 1100 : MAX_W }]}>{children}</View>;
  return (
    <View style={s.page}>
      <Header title={title} right={right} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {inner}
          </ScrollView>
        ) : (
          <View style={[s.scroll, { flex: 1 }]}>{inner}</View>
        )}
        {footer ? (
          <View style={s.footerWrap}>
            <View style={[s.footerInner, { maxWidth: wide ? 1100 : MAX_W }]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function useWide(min = 900) {
  return useWindowDimensions().width >= min;
}

// ----------------------------------------------------------------- building blocks
export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: boolean }) {
  return <View style={[s.card, tint && { backgroundColor: C.tint, borderColor: C.tint }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <Text style={s.groupLabel}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: any }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Stat({ label, value, tint }: { label: string; value: string | number; tint?: boolean }) {
  return (
    <View style={[s.stat, tint && { backgroundColor: C.tint, borderColor: '#C7D7FB' }]}>
      <Text style={[s.statLabel, tint && { color: C.action }]}>{label}</Text>
      <Text style={[s.statValue, tint && { color: C.action }]}>{value}</Text>
    </View>
  );
}

type BtnKind = 'primary' | 'secondary' | 'danger' | 'link' | 'dangerLink';
export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  icon,
  style,
  big,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        big && { minHeight: 60 },
        kind === 'primary' && { backgroundColor: pressed ? C.actionPressed : C.action },
        kind === 'secondary' && s.btnSecondary,
        kind === 'danger' && s.btnDanger,
        (kind === 'link' || kind === 'dangerLink') && s.btnLink,
        off && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={kind === 'primary' ? '#fff' : C.action} />
      ) : (
        <View style={s.btnRow}>
          {icon}
          <Text
            style={[
              s.btnText,
              big && { fontSize: 18 },
              kind === 'primary' && { color: '#fff' },
              kind === 'secondary' && { color: C.text, fontWeight: '600' },
              kind === 'danger' && { color: C.danger },
              kind === 'link' && { color: C.action, textDecorationLine: 'underline' },
              kind === 'dangerLink' && { color: C.danger, textDecorationLine: 'underline' },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Input({ error, highlight, style, ...p }: TextInputProps & { error?: boolean; highlight?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={C.placeholder}
      style={[s.input, highlight && { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }, error && { borderColor: C.danger }, style]}
      {...p}
    />
  );
}

export function Field({
  label,
  required,
  error,
  children,
  style,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={s.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function Row({ children, gap = 10, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap }, style]}>{children}</View>;
}

export function Chip({ title, active, onPress }: { title: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: C.action }]}>{title}</Text>
    </Pressable>
  );
}

export function Pill({ text, kind }: { text: string; kind: 'warn' | 'ok' | 'info' | 'danger' }) {
  const bg = { warn: C.warnTint, ok: C.okTint, info: C.tint, danger: C.dangerTint }[kind];
  const fg = { warn: C.warn, ok: C.ok, info: C.action, danger: C.danger }[kind];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segmentItem, value === o.value && s.segmentActive]}>
          <Text style={[s.segmentText, value === o.value && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: '#CBD5E1', true: C.action }}
      thumbColor="#fff"
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff' } as any) : {})}
    />
  );
}

export function Checkbox({ checked, onPress }: { checked: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[s.check, checked && { backgroundColor: C.action, borderColor: C.action }]}>
      {checked ? <Text style={s.checkMark}>✓</Text> : null}
    </Pressable>
  );
}

export function Banner({ title, text, kind = 'warn' }: { title?: string; text: string; kind?: 'warn' | 'danger' | 'info' | 'ok' }) {
  const bg = { warn: C.warnTint, danger: C.dangerTint, info: C.tint, ok: C.okTint }[kind];
  const fg = { warn: C.warn, danger: C.danger, info: C.action, ok: C.ok }[kind];
  return (
    <View style={[s.banner, { backgroundColor: bg }]}>
      {title ? <Text style={[s.bannerTitle, { color: fg }]}>{title}</Text> : null}
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={C.action} />
    </View>
  );
}

export function ListRow({ children, onPress, last }: { children: ReactNode; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.listRow, !last && { borderBottomWidth: 1, borderBottomColor: C.border }, pressed && onPress && { backgroundColor: '#F8FAFC' }]}
    >
      {children}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.ground },
  header: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 14, paddingHorizontal: 20 },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 1100, alignSelf: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: C.text, flexShrink: 1 },
  roleBadge: { borderWidth: 1.5, borderColor: C.text, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: 0.5 },
  scroll: { padding: 18, paddingBottom: 32 },
  pageInner: { width: '100%', alignSelf: 'center' },
  footerWrap: { padding: 12, backgroundColor: C.ground },
  footerInner: { width: '100%', alignSelf: 'center' },
  card: { backgroundColor: C.card, borderRadius: R.card, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 6, marginBottom: 10 },
  groupLabel: { fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginTop: 6, marginBottom: 8, textTransform: 'uppercase' },
  muted: { color: C.muted, fontSize: 14 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: R.card, padding: 14, minHeight: 84 },
  statLabel: { fontSize: 13, color: C.text, marginBottom: 8 },
  statValue: { fontSize: 26, fontWeight: '700', color: C.text },
  btn: { minHeight: 52, borderRadius: R.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnSecondary: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnDanger: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.danger },
  btnLink: { minHeight: 44, backgroundColor: 'transparent' },
  label: { fontSize: 14, color: C.muted, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.inputBorder,
    backgroundColor: C.card,
    borderRadius: R.input,
    paddingHorizontal: 12,
    fontSize: 16,
    color: C.text,
  },
  error: { color: C.danger, fontSize: 13, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: R.pill, paddingHorizontal: 14, height: 40, justifyContent: 'center' },
  chipActive: { backgroundColor: C.tint, borderColor: C.action },
  chipText: { fontSize: 14, fontWeight: '600', color: C.text },
  pill: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, borderRadius: R.input, overflow: 'hidden', minHeight: 48 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: C.action },
  segmentText: { fontSize: 15, fontWeight: '700', color: C.text },
  check: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkMark: { color: '#fff', fontWeight: '900', fontSize: 16, lineHeight: 18 },
  banner: { borderRadius: R.card, padding: 14, marginBottom: 14 },
  bannerTitle: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  listRow: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
