import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { AttemptResult, PublicGame } from '@oquplay/shared';
import { api } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Button, Card, colors, ErrorBox, Loading, Page, s } from '../src/ui';
import { GameBoard, initialAnswers } from '../src/GameBoard';
import { remainingSeconds } from '../src/timer';
type PlayResponse = { id: string; game: PublicGame; startedAt: string; expiresAt: string | null; serverNow: string; completed: boolean; result: AttemptResult | null; isDemo: boolean };
type PlayData = PlayResponse & { receivedAt: number };
function Result({ result }: { result: AttemptResult }) {
 const { t } = useApp(), router = useRouter(); const [error, setError] = useState<unknown>(), [busy,setBusy] = useState(false);
 async function retry() { setBusy(true); setError(undefined); try { const a = await api<{ id: string }>(`/attempts/${result.id}/retry`, { method: 'POST', key: randomUUID() }); router.replace({ pathname: '/play', params: { id: a.id } }); } catch (e) { setError(e); } finally { setBusy(false); } }
 return <><Card style={{ alignItems: 'center', backgroundColor: colors.pale }}><Badge label={t('result')} /><Text style={{ color: colors.violet, fontWeight: '800', fontSize: 64 }}>{result.percent}%</Text><Text style={s.subtitle}>{t('correct')}: {result.score} / {result.total}</Text><Text style={s.muted}>{t('timeSpent')}: {result.elapsedSec} {t('seconds')}</Text>{result.isDemo ? <Badge label={t('demo')} /> : null}{result.timedOut ? <ErrorBox error="timedOut" /> : null}<Button label={t('retry')} icon="rotate-ccw" busy={busy} onPress={() => { void retry(); }} /><ErrorBox error={error} /></Card>
 {result.review.map((r,i) => <Card key={r.id}><Badge label={`${i + 1} · ${t(r.correct ? 'correct' : 'incorrect')}`} success={r.correct} /><Text style={s.subtitle}>{r.prompt}</Text><Text style={s.body}>{t('yourAnswer')}: {r.given}</Text><Text style={[s.body, { color: colors.green }]}>{t('expected')}: {r.expected}</Text><Text style={s.body}>{r.explanation}</Text><Text style={s.muted}>{t('evidence')}: {r.evidence}</Text></Card>)}</>;
}
function Active({ data }: { data: PlayData }) {
 const { t } = useApp(), qc = useQueryClient(); const [answers, setAnswers] = useState(() => initialAnswers(data.game)), [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(), [remaining,setRemaining] = useState<number | null>(() => remainingSeconds(data));
 const latest = useRef(answers), sending = useRef(false), autoSent = useRef(false); latest.current = answers;
 const count = data.game.gameType === 'matching' ? data.game.left.length : data.game.items.length;
 const submitRef = useRef<(forced?: boolean) => Promise<void>>(async () => {});
 async function submit(forced = false) {
  if (sending.current) return;
  if (!forced && Object.keys(latest.current).length < count) { setError('unanswered'); return; }
  sending.current = true; setBusy(true); setError(undefined);
  try { const result = await api<AttemptResult>(`/attempts/${data.id}/submit`, { method: 'POST', body: { answers: latest.current } }); qc.setQueryData(['attempt',data.id], { ...data, completed: true, result }); void qc.invalidateQueries({ queryKey: ['history'] }); }
  catch (e) { setError(e); } finally { sending.current = false; setBusy(false); }
 }
 submitRef.current = submit;
 useEffect(() => {
  if (!data.expiresAt) return;
  const tick = () => { const sec = remainingSeconds(data); setRemaining(sec); if (sec === 0 && !autoSent.current) { autoSent.current = true; void submitRef.current(true); } };
  tick(); const timer = setInterval(tick, 500); return () => clearInterval(timer);
 }, [data.id, data.expiresAt, data.serverNow, data.receivedAt]);
 return <><Card><View style={[s.row,{justifyContent:'space-between'}]}><Badge label={`${t('answered')}: ${Object.keys(answers).length} / ${count}`} />{remaining !== null ? <Text accessibilityLiveRegion="polite" style={s.subtitle}>{t('remaining')}: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</Text> : null}</View><Text style={s.body}>{data.game.instructions}</Text><Text style={s.muted}>{t('scoring')}</Text>{data.isDemo ? <Badge label={t('demo')} /> : null}</Card><GameBoard game={data.game} answers={answers} setAnswers={setAnswers} disabled={busy || remaining === 0} /><ErrorBox error={error} /><Button label={t('finish')} busy={busy} icon="check" onPress={() => { void submit(remaining === 0); }} /></>;
}
export default function Play() {
 const { id } = useLocalSearchParams<{ id: string }>(), { t, loading } = useApp();
 const query = useQuery({ queryKey: ['attempt',id], queryFn: async () => { const data = await api<PlayResponse>(`/attempts/${id}`); return { ...data, receivedAt: Date.now() }; }, enabled: !!id && !loading, refetchOnWindowFocus: false, staleTime: Infinity });
 return <Page title={query.data?.game.title ?? t('loading')}><ErrorBox error={query.error} />{query.isPending ? <Loading /> : query.data ? query.data.result ? <Result key={id} result={query.data.result} /> : <Active key={id} data={query.data} /> : null}</Page>;
}
