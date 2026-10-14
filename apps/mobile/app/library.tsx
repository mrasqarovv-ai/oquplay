import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { GameSummary } from '@oquplay/shared';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Button, Card, Choices, ErrorBox, Field, Loading, Page, RequireLogin, s } from '../src/ui';
export default function Library() {
 const { t, user } = useApp(), router = useRouter(), qc = useQueryClient();
 const [search, setSearch] = useState(''), [type, setType] = useState('all'), [status, setStatus] = useState('all'), [subject, setSubject] = useState('all'), [error, setError] = useState<unknown>(), [busy, setBusy] = useState('');
 const games = useQuery({ queryKey: ['games'], queryFn: () => api<GameSummary[]>('/games'), enabled: !!user });
 async function action(id: string, name: 'duplicate' | 'archive' | 'close') { setBusy(id); setError(undefined); try { const result = await api<{ id?: string }>(`/games/${id}/${name}`, { method: 'POST' }); await qc.invalidateQueries({ queryKey: ['games'] }); if (name === 'duplicate' && result.id) router.push({ pathname: '/create', params: { id: result.id } }); } catch (e) { setError(e); } finally { setBusy(''); } }
 const filtered = games.data?.filter(g => g.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (type === 'all' || g.gameType === type) && (status === 'archived' ? g.archived : !g.archived && (status === 'all' || g.status === status)) && (subject === 'all' || g.subject === subject));
 return <Page title={t('library')}><RequireLogin><View style={s.row}><Button label={t('create')} icon="plus" onPress={() => router.push('/create')} /></View><Card><Field label={t('search')} value={search} onChangeText={setSearch} /><Choices label={t('type')} value={type} onChange={setType} options={['all','quiz','matching','ordering'].map(v => ({ value: v, label: t(v as 'all' | 'quiz') }))} /><Choices label={t('status')} value={status} onChange={setStatus} options={['all','DRAFT','PUBLISHED','CLOSED','archived'].map(v => ({ value: v, label: t(v as 'all' | 'DRAFT') }))} /><Choices label={t('subject')} value={subject} onChange={setSubject} options={[{ value: 'all', label: t('all') }, ...[...new Set(games.data?.map(g => g.subject) ?? [])].map(v => ({ value: v, label: v }))]} /></Card>
  <ErrorBox error={error ?? games.error} />{games.isPending ? <Loading /> : !filtered?.length ? <Card><Text style={s.subtitle}>{t('emptyGames')}</Text><Text style={s.muted}>{t('emptyGamesText')}</Text></Card> : null}
  {filtered?.map(g => <Card key={g.id}><View style={[s.row, { justifyContent: 'space-between' }]}><Badge label={g.archived ? t('archived') : t(g.status)} success={g.status === 'PUBLISHED' && !g.archived} />{g.isDemo ? <Badge label={t('demo')} /> : null}</View><Text style={s.subtitle}>{g.title}</Text><Text style={s.muted}>{g.subject} · {t(g.gameType)}</Text><View style={s.row}>
   {!g.archived ? <Button label={t('edit')} icon="edit-2" onPress={() => router.push({ pathname: '/create', params: { id: g.id } })} /> : null}
   {user?.role === 'TEACHER' ? <Button label={t('analytics')} kind="secondary" onPress={() => router.push({ pathname: '/analytics', params: { id: g.id } })} /> : null}
   <Button label={t('duplicate')} kind="ghost" disabled={busy === g.id} onPress={() => { void action(g.id,'duplicate'); }} />
   {g.status === 'PUBLISHED' ? <Button label={t('close')} kind="ghost" disabled={busy === g.id} onPress={() => { void action(g.id,'close'); }} /> : null}
   {!g.archived ? <Button label={t('archive')} kind="danger" disabled={busy === g.id} onPress={() => { void action(g.id,'archive'); }} /> : null}
  </View></Card>)}
 </RequireLogin></Page>;
}
