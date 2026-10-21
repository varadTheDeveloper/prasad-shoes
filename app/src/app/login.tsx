import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input } from '@/components/ui';
import { C, R } from '@/lib/theme';

export default function Login() {
  const { login } = useAuth();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!mobile.trim() || !password) return setError('Enter mobile number and password');
    setBusy(true);
    try {
      await login(mobile, password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <View style={st.box}>
          <Image source={require('../../assets/logo.png')} style={st.logo} accessibilityLabel="Prasad Shoes" />
          <Text style={st.sub}>Orders and parcel labels</Text>

          <Field label="Mobile number">
            <Input value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="10-digit mobile" maxLength={14} autoComplete="tel" />
          </Field>
          <Field label="Password" error={error}>
            <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" onSubmitEditing={submit} autoComplete="password" />
          </Field>
          <Button title="Log in" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
          <Text style={st.hint}>Forgot password? Ask the owner to reset it.</Text>
        </View>
        <Text style={st.addr}>1306, Shukrawar Peth, Pune 411002</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  logo: { width: 200, height: 200, borderRadius: R.card, alignSelf: 'center' },
  sub: { fontSize: 15, color: C.muted, textAlign: 'center', marginTop: 10, marginBottom: 28 },
  hint: { textAlign: 'center', color: C.muted, marginTop: 18, fontSize: 14 },
  addr: { textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 48 },
});
