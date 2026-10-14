import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { APP_NAME, type TranslationKey } from '@oquplay/shared';
import { useApp } from './context';
import { ApiError } from './api';
export const colors = { ink: '#172642', muted: '#62718A', violet: '#6951DD', pale: '#F0EDFF', border: '#E1E7F0', bg: '#F7F9FD', white: '#FFFFFF', green: '#167454', red: '#B33945' };
export const s = StyleSheet.create({ row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }, stack: { gap: 20 }, title: { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 }, subtitle: { fontSize: 18, fontWeight: '700', color: colors.ink }, body: { fontSize: 15, lineHeight: 23, color: colors.ink }, muted: { fontSize: 14, lineHeight: 22, color: colors.muted }, card: { backgroundColor: colors.white, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 16 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 16 }, label: { color: colors.ink, fontSize: 14, fontWeight: '600' } });
export function Icon({ name, color = colors.violet, size = 20 }: { name: React.ComponentProps<typeof Feather>['name']; color?: string; size?: number }) { return <Feather name={name} color={color} size={size} />; }
export function Button({ label, onPress, kind = 'primary', disabled = false, icon, busy = false, testID }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; icon?: React.ComponentProps<typeof Feather>['name']; busy?: boolean; testID?: string }) {
 const textColor = kind === 'primary' ? colors.white : kind === 'danger' ? colors.red : colors.ink;
 return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: disabled || busy ? 0.5 : pressed ? 0.78 : 1, borderWidth: kind === 'secondary' ? 1 : 0, borderColor: colors.border, backgroundColor: kind === 'primary' ? colors.violet : kind === 'danger' ? '#FFF0F1' : kind === 'secondary' ? colors.white : 'transparent' })}>
  {busy ? <ActivityIndicator color={textColor} /> : icon ? <Icon name={icon} color={textColor} size={18} /> : null}<Text style={{ color: textColor, fontWeight: '700', fontSize: 14 }}>{label}</Text>
 </Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[s.card, style]}>{children}</View>; }
export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
 return <View style={{ gap: 7, flexGrow: 1 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#8794A7" {...props} style={[s.input, props.multiline ? { minHeight: 100, textAlignVertical: 'top' } : {}, props.style]} />{hint ? <Text style={s.muted}>{hint}</Text> : null}</View>;
}
export function Choices<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
 return <View style={{ gap: 10 }}><Text style={s.label}>{label}</Text><View style={s.row}>{options.map(o => <Pressable key={o.value} accessibilityRole="radio" aria-checked={o.value === value} accessibilityState={{ checked: o.value === value }} accessibilityLabel={o.label} onPress={() => onChange(o.value)} style={{ borderWidth: 1, borderColor: o.value === value ? colors.violet : colors.border, backgroundColor: o.value === value ? colors.pale : colors.white, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, minHeight: 46 }}><Text style={{ color: o.value === value ? colors.violet : colors.ink, fontWeight: '600' }}>{o.label}</Text></Pressable>)}</View></View>;
}
export function Badge({ label, success = false }: { label: string; success?: boolean }) { return <View style={{ alignSelf: 'flex-start', backgroundColor: success ? '#E5F4EC' : colors.pale, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ fontSize: 12, fontWeight: '700', color: success ? colors.green : colors.violet }}>{label}</Text></View>; }
export function ErrorBox({ error }: { error?: unknown }) {
 const { t } = useApp(); if (!error) return null;
 const code = error instanceof ApiError ? error.code : typeof error === 'string' ? error : 'server_error';
 const label = (key: string) => { try { return t(key as TranslationKey) || t('fieldRequired'); } catch { return t('fieldRequired'); } };
 return <View accessibilityRole="alert" style={{ backgroundColor: '#FFF0F1', borderRadius: 12, padding: 16, gap: 8 }}><Text style={{ color: colors.red, fontWeight: '600', lineHeight: 22 }}>{label(code)}</Text>{error instanceof ApiError && error.fields?.map((f, i) => <Text key={i} style={{ color: colors.red, lineHeight: 20 }}>{f.path.map((p, j) => typeof p === 'number' ? `${p + 1}` : j === 0 && p === 'content' ? '' : label(p)).filter(Boolean).join(' › ')}: {label(f.message)}</Text>)}</View>;
}
export function Loading() { const { t } = useApp(); return <View style={[s.row, { padding: 28 }]}><ActivityIndicator color={colors.violet} /><Text style={s.muted}>{t('loading')}</Text></View>; }
export function Page({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
 const { t, lang, setLang, user, logout, sessionError, refreshSession } = useApp(), router = useRouter();
 return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
  <View style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.border }}><View style={[s.row, { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 18, justifyContent: 'space-between' }]}>
   <Pressable accessibilityRole="link" accessibilityLabel={t('home')} onPress={() => router.push('/')} style={s.row}><View style={{ backgroundColor: colors.violet, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Icon name="book-open" color="white" /></View><Text style={{ fontSize: 21, color: colors.ink, fontWeight: '800', letterSpacing: -0.5 }}>{APP_NAME}</Text></Pressable>
   <View style={[s.row, { gap: 4 }]}><Button label={lang === 'kk' ? 'ҚАЗ / РУС' : 'РУС / ҚАЗ'} kind="ghost" onPress={() => setLang(lang === 'kk' ? 'ru' : 'kk')} />{user ? <Button label={t('logout')} kind="ghost" onPress={() => { void logout().then(() => router.replace('/')).catch(() => refreshSession()); }} /> : <Button label={t('login')} kind="secondary" onPress={() => router.push('/auth')} />}</View>
  </View></View>
  <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 24, paddingBottom: 60, gap: 24 }}>
   {user ? <View style={s.row}><Button label={t('home')} icon="grid" kind="ghost" onPress={() => router.push('/')} /><Button label={t('library')} icon="folder" kind="ghost" onPress={() => router.push('/library')} /><Button label={t('history')} icon="bar-chart-2" kind="ghost" onPress={() => router.push('/history')} /><Button label={t('join')} icon="hash" kind="ghost" onPress={() => router.push('/join')} /></View> : null}
   {sessionError ? <View style={s.stack}><ErrorBox error={sessionError} /><Button label={t('refresh')} kind="secondary" onPress={() => { void refreshSession(); }} /></View> : null}
   {title ? <View style={{ gap: 8 }}><Text accessibilityRole="header" style={s.title}>{title}</Text>{subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}</View> : null}
   {children}
  </View>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function RequireLogin({ children }: { children: React.ReactNode }) { const { user, loading, t } = useApp(), router = useRouter(); return loading ? <Loading /> : user ? <>{children}</> : <Card><Text style={s.body}>{t('login_required')}</Text><Button label={t('login')} onPress={() => router.push('/auth')} /></Card>; }
