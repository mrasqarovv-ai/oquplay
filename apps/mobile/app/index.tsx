import { Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { GameSummary } from '@oquplay/shared';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Button, Card, colors, ErrorBox, Icon, Loading, Page, s } from '../src/ui';
export default function Home() {
 const { user, t, mode } = useApp(), router = useRouter(), wide = useWindowDimensions().width > 800;
 const games = useQuery({ queryKey: ['games'], queryFn: () => api<GameSummary[]>('/games'), enabled: !!user });
 const recent = useQuery({ queryKey: ['teacherRecent'], queryFn: () => api<{id:string;nickname:string;gameId:string;title:string;percent:number}[]>('/teacher/recent'), enabled: user?.role === 'TEACHER' });
 return <Page>
  <View style={{ flexDirection: wide ? 'row' : 'column', gap: 32, alignItems: 'stretch', paddingVertical: 20 }}>
   <View style={{ flex: 1.3, gap: 24, paddingVertical: 12 }}>
    <Badge label={user ? `${t('welcome')}, ${user.name}` : t('learningSpace')} />
    <Text accessibilityRole="header" style={{ fontSize: wide ? 52 : 36, lineHeight: wide ? 60 : 44, fontWeight: '800', letterSpacing: -1.4, color: colors.ink }}>{t('hero')}</Text>
    <Text style={[s.muted, { fontSize: 17, lineHeight: 28, maxWidth: 540 }]}>{t('heroText')}</Text>
    <View style={s.row}>{user ? <Button label={user.role === 'TEACHER' ? t('create') : t('myPractice')} icon="plus" onPress={() => router.push('/create')} /> : <><Button label={t('teacher')} icon="book-open" onPress={() => router.push({ pathname: '/auth', params: { role: 'TEACHER', register: '1' } })} /><Button label={t('student')} kind="secondary" onPress={() => router.push({ pathname: '/auth', params: { role: 'STUDENT', register: '1' } })} /></>}</View>
    <View style={s.row}><Icon name="monitor" size={16} color={colors.muted} /><Text style={s.muted}>{t('mobileHint')}</Text></View>
   </View>
   <View style={{ flex: 1, backgroundColor: '#EDE9FF', borderRadius: 28, padding: wide ? 28 : 20, gap: 18, justifyContent: 'center' }}>
    <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={[s.subtitle, { color: colors.violet }]}>{t('createHint')}</Text><Icon name="layers" /></View>
    {(['quiz', 'matching', 'ordering'] as const).map((type, i) => <Card key={type} style={{ padding: 18, borderWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 16 }}><View style={{ width: 44, height: 44, backgroundColor: colors.pale, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Icon name={(['check-circle', 'link-2', 'list'] as const)[i]!} /></View><View style={{ flex: 1, gap: 4 }}><Text style={s.subtitle}>{t(type)}</Text><Text style={[s.muted, { fontSize: 12 }]}>{t((['quizDesc', 'matchingDesc', 'orderingDesc'] as const)[i]!)}</Text></View></Card>)}
    <Badge label={mode === 'demo' ? t('demo') : t('live')} success={mode === 'live'} />
   </View>
  </View>
  <Card style={{ backgroundColor: colors.ink, borderWidth: 0, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', justifyContent: 'space-between' }}><View style={{ gap: 8 }}><Text style={{ color: 'white', fontSize: 22, fontWeight: '700' }}>{t('join')}</Text><Text style={{ color: '#C4CEE0', lineHeight: 22 }}>{t('codeHint')}</Text></View><Button label={t('join')} icon="arrow-right" onPress={() => router.push('/join')} /></Card>
  {user ? <><View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.subtitle}>{t('recent')}</Text><Button label={t('library')} kind="ghost" onPress={() => router.push('/library')} /></View>{games.isPending ? <Loading /> : <ErrorBox error={games.error} />}
   {!games.data?.length && !games.isPending ? <Card><Text style={s.subtitle}>{t('emptyGames')}</Text><Text style={s.muted}>{t('emptyGamesText')}</Text></Card> : null}
   <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>{games.data?.filter(g => !g.archived).slice(0, 3).map(g => <Card key={g.id} style={{ flex: 1 }}><Badge label={t(g.status)} /><Text style={s.subtitle}>{g.title}</Text><Text style={s.muted}>{g.subject} · {t(g.gameType)}</Text><Button label={t('open')} kind="secondary" onPress={() => router.push({ pathname: '/create', params: { id: g.id } })} /></Card>)}</View>
  </> : <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>{(['feature1', 'feature2', 'feature3'] as const).map((k, i) => <Card key={k} style={{ flex: 1 }}><Icon name={(['layers', 'globe', 'bar-chart-2'] as const)[i]!} /><Text style={s.subtitle}>{t(k)}</Text></Card>)}</View>}
 {user?.role==='TEACHER'?<><Text style={s.subtitle}>{t('recentResults')}</Text><ErrorBox error={recent.error} />{recent.isPending?<Loading />:!recent.data?.length?<Text style={s.muted}>{t('noResultsText')}</Text>:recent.data.map(r=><Card key={r.id}><View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.subtitle}>{r.nickname} · {r.title}</Text><Badge label={`${r.percent}%`} success={r.percent>=70}/></View><Button label={t('analytics')} kind="ghost" onPress={()=>router.push({pathname:'/analytics',params:{id:r.gameId}})} /></Card>)}</>:null}
 </Page>;
}
