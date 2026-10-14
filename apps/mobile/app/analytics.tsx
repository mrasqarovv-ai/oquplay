import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Card, colors, ErrorBox, Loading, Page, RequireLogin, s } from '../src/ui';
type Analytics = { title:string; participants:number; attempts:number; average:number; rows:{nickname:string;attempts:number;best:number;last:number}[];hardest:{prompt:string;version:number;wrong:number;tries:number}[] };
export default function AnalyticsScreen() {
 const {id}=useLocalSearchParams<{id:string}>(),{t,user}=useApp(); const query=useQuery({queryKey:['analytics',id],queryFn:()=>api<Analytics>(`/games/${id}/analytics`),enabled:!!id&&!!user}); const data=query.data;
 return <Page title={t('analytics')} subtitle={data?.title}><RequireLogin><ErrorBox error={query.error} />{query.isPending ? <Loading /> : data ? <>
 <View style={s.row}>{([['participants',data.participants],['attempts',data.attempts],['average',`${data.average}%`]] as const).map(([k,v])=><Card key={k} style={{flexGrow:1,minWidth:150}}><Text style={s.muted}>{t(k)}</Text><Text style={[s.title,{color:colors.violet}]}>{v}</Text></Card>)}</View><Text style={s.muted}>{t('allAttempts')}</Text>
 {!data.rows.length ? <Card><Text style={s.subtitle}>{t('noResults')}</Text><Text style={s.muted}>{t('noResultsText')}</Text></Card> : data.rows.map((row,i)=><Card key={i}><Text style={s.subtitle}>{row.nickname}</Text><View style={s.row}><Badge label={`${t('attempts')}: ${row.attempts}`} /><Text style={s.body}>{t('best')}: {row.best}%</Text><Text style={s.body}>{t('last')}: {row.last}%</Text></View></Card>)}
 {data.hardest.length ? <Text style={s.subtitle}>{t('mistakes')}</Text>:null}{data.hardest.map((r,i)=><Card key={i}><Badge label={`${t('version')} ${r.version}`} /><Text style={s.body}>{r.prompt}</Text><Text style={s.muted}>{t('wrong')}: {r.wrong} / {r.tries}</Text><View style={{height:8,backgroundColor:colors.pale,borderRadius:4}}><View style={{height:8,width:`${r.wrong/r.tries*100}%`,backgroundColor:colors.violet,borderRadius:4}} /></View></Card>)}
 </>:null}</RequireLogin></Page>;
}
