import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { AttemptResult } from '@oquplay/shared';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Button, Card, ErrorBox, Loading, Page, RequireLogin, s } from '../src/ui';
export default function History() {
 const { t, user } = useApp(), router = useRouter(), query = useQuery({ queryKey:['history'], queryFn:()=>api<AttemptResult[]>('/history'), enabled:!!user });
 return <Page title={t('history')}><RequireLogin><ErrorBox error={query.error} />{query.isPending ? <Loading /> : !query.data?.length ? <Card><Text style={s.subtitle}>{t('noResults')}</Text><Text style={s.muted}>{t('noResultsText')}</Text></Card> : query.data.map(r => <Card key={r.id}><View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.subtitle}>{r.title}</Text><Badge label={`${r.percent}%`} success={r.percent>=70} /></View><Text style={s.muted}>{r.score}/{r.total} · {r.elapsedSec} {t('seconds')}</Text><Button label={t('open')} kind="secondary" onPress={()=>router.push({pathname:'/play',params:{id:r.id}})} /></Card>)}</RequireLogin></Page>;
}
