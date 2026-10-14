import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Button, Card, ErrorBox, Field, Page, s } from '../src/ui';
export default function Join() {
 const { code: initial } = useLocalSearchParams<{ code?: string }>(), { t, user, loading } = useApp(), router = useRouter();
 const [code, setCode] = useState(initial ?? ''), [nickname, setNickname] = useState(user?.name ?? ''), [error, setError] = useState<unknown>(), [busy, setBusy] = useState(false), [key] = useState(randomUUID);
 async function start() { setBusy(true); setError(undefined); try { const result = await api<{ id: string }>('/join', { method: 'POST', key, body: { code: code.replace(/[\s-]/g, '').toUpperCase(), nickname } }); router.replace({ pathname: '/play', params: { id: result.id } }); } catch (e) { setError(e); } finally { setBusy(false); } }
 return <Page><Card style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}><Text style={s.title}>{t('join')}</Text><Text style={s.muted}>{t('codeHint')}</Text><Field label={t('code')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={24} style={{ fontSize: 22, letterSpacing: 2 }} /><Field label={t('nickname')} value={nickname} onChangeText={setNickname} maxLength={40} /><Text style={s.muted}>{t('guestPrivacy')}</Text><ErrorBox error={error} /><Button label={t('start')} icon="play" busy={busy} disabled={loading || !nickname.trim() || code.replace(/[\s-]/g, '').length !== 16} onPress={() => { void start(); }} /></Card></Page>;
}
