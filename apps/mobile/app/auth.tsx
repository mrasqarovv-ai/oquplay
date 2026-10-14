import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Button, Card, Choices, ErrorBox, Field, Page, s } from '../src/ui';
import { applySession, type SessionData } from '../src/session';
export default function Auth() {
 const params = useLocalSearchParams<{ role?: string; register?: string }>(), router = useRouter(), { t } = useApp(), qc = useQueryClient();
 const [register, setRegister] = useState(params.register === '1'), [role, setRole] = useState<'TEACHER' | 'STUDENT'>(params.role === 'STUDENT' ? 'STUDENT' : 'TEACHER');
 const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>();
 async function submit() { setBusy(true); setError(undefined); try { const session = await api<SessionData>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: { email: email.trim(), password, ...(register ? { name, role } : {}) } }); await applySession(qc, session); router.replace('/'); } catch (e) { setError(e); } finally { setBusy(false); } }
 return <Page><Card style={{ maxWidth: 520, width: '100%', alignSelf: 'center', padding: 28 }}><Text style={s.title}>{t(register ? 'register' : 'login')}</Text><Choices label={t('newAccount')} value={register ? 'register' : 'login'} onChange={v => { setRegister(v === 'register'); setError(undefined); }} options={[{ value: 'register', label: t('register') }, { value: 'login', label: t('haveAccount') }]} />
  {register ? <><Choices label={t('role')} value={role} onChange={setRole} options={[{ value: 'TEACHER', label: t('teacherRole') }, { value: 'STUDENT', label: t('studentRole') }]} /><Field label={t('name')} value={name} onChangeText={setName} maxLength={60} autoComplete="name" /></> : null}
  <Field label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} />
  <Field label={t('password')} hint={t('passwordHint')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={register ? 'new-password' : 'current-password'} />
  <ErrorBox error={error} /><Button label={t(register ? 'register' : 'login')} onPress={() => { void submit(); }} busy={busy} />
  <Button label={t('guest')} kind="ghost" onPress={() => router.push('/join')} />
 </Card></Page>;
}
