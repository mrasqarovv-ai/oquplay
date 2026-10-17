import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { LessonInputSchema, type LessonDetail, type LessonInput, type LessonSummary } from '@oquplay/shared';
import { api, ApiError } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Button, Card, Choices, colors, ErrorBox, Field, Loading, Page, RequireLogin, s } from '../src/ui';
import { downloadMaterial, downloadPresentation, downloadVideo, videoSupported } from '../src/lessonExports';

function LessonStudio() {
 const { lang, t, mode } = useApp(), router = useRouter(), qc = useQueryClient(), { id } = useLocalSearchParams<{ id?: string }>();
 const [form, setForm] = useState<LessonInput>({ topic: '', subject: '', grade: 6, language: lang, difficulty: 'A', gameType: 'quiz', count: 5 });
 const [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false), [video, setVideo] = useState<number | null>(null), [error, setError] = useState<unknown>();
 const [advanced, setAdvanced] = useState(false), [tab, setTab] = useState<'material' | 'tasks' | 'slides'>('material');
 const request = useRef<{ fingerprint: string; key: string } | null>(null), videoAbort = useRef<AbortController | null>(null);
 useEffect(() => () => videoAbort.current?.abort(), []);
 useEffect(() => { videoAbort.current?.abort(); setError(undefined); setTab('material'); }, [id]);
 const lessons = useQuery({ queryKey: ['lessons'], queryFn: () => api<LessonSummary[]>('/lessons') });
 const detail = useQuery({ queryKey: ['lesson', id], queryFn: () => api<LessonDetail>(`/lessons/${id}`), enabled: !!id });
 const content = id ? detail.data?.content : undefined;
 const change = <K extends keyof LessonInput>(key: K, value: LessonInput[K]) => setForm(f => ({ ...f, [key]: value }));
 async function generate() {
  setError(undefined);
  const parsed = LessonInputSchema.safeParse(form);
  if (!parsed.success) { setError(new ApiError('validation_error', parsed.error.issues.map(i => ({ path: i.path as (string | number)[], message: i.message })))); return; }
  const fingerprint = JSON.stringify(parsed.data);
  if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: randomUUID() };
  setBusy(true);
  try {
   const result = await api<LessonDetail>('/lessons/generate', { method: 'POST', key: request.current.key, body: parsed.data, timeoutMs: 200000 });
   qc.setQueryData(['lesson', result.id], result); await qc.invalidateQueries({ queryKey: ['lessons'] }); await qc.invalidateQueries({ queryKey: ['games'] });
   request.current = null; router.replace({ pathname: '/lessons', params: { id: result.id } });
  } catch (e) { setError(e); if (!(e instanceof ApiError) || !['network_error', 'generation_running'].includes(e.code)) request.current = null; }
  finally { setBusy(false); }
 }
 async function exportFile(kind: 'material' | 'slides' | 'video') {
  if (!content || !id) return; setError(undefined); setExporting(true);
  try {
   if (kind === 'material') downloadMaterial(content);
   else if (kind === 'slides') await downloadPresentation(id);
   else { const controller = new AbortController(); videoAbort.current = controller; setVideo(0); await downloadVideo(content, { signal: controller.signal, onProgress: setVideo }); }
  } catch (e) { if (!(e instanceof ApiError) || e.code !== 'video_cancelled') setError(e); }
  finally { setExporting(false); setVideo(null); videoAbort.current = null; }
 }
 return <>
  {mode === 'demo' ? <Card style={{ backgroundColor: colors.pale }}><Badge label={t('demo')} /><Text style={s.body}>{t('lessonDemoNotice')}</Text></Card> : null}
  {!id ? <Card>
   <Field label={t('topic')} hint={t('lessonTopicHint')} value={form.topic} onChangeText={v => change('topic', v)} maxLength={160} placeholder={t('lessonTopicPlaceholder')} editable={!busy} />
   <Choices label={t('grade')} value={form.grade} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} onChange={v => { if (!busy) change('grade', v); }} />
   <Choices label={t('language')} value={form.language} options={[{ value: 'kk', label: 'Қазақша' }, { value: 'ru', label: 'Русский' }]} onChange={v => { if (!busy) change('language', v); }} />
   <Button label={t('lessonAdvanced')} kind="ghost" disabled={busy} onPress={() => setAdvanced(!advanced)} />
   {advanced ? <><Field label={t('lessonSubjectOptional')} value={form.subject} onChangeText={v => change('subject', v)} maxLength={100} editable={!busy} />
    <Choices label={t('difficulty')} value={form.difficulty} options={(['A', 'B', 'C'] as const).map(v => ({ value: v, label: t(`level${v}`) }))} onChange={v => { if (!busy) change('difficulty', v); }} />
    <Choices label={t('type')} value={form.gameType} options={(['quiz', 'matching', 'ordering'] as const).map(v => ({ value: v, label: t(v) }))} onChange={v => { if (!busy) change('gameType', v); }} />
    <Choices label={t(form.gameType === 'quiz' ? 'countQuiz' : form.gameType === 'matching' ? 'countMatching' : 'countOrdering')} value={form.count} options={([5, 10, 15] as const).map(v => ({ value: v, label: String(v) }))} onChange={v => { if (!busy) change('count', v); }} /></> : null}
   <Text style={s.muted}>{t('lessonIncludes')}</Text><Button label={t(busy ? 'generating' : 'lessonGenerate')} icon="zap" busy={busy} disabled={!form.topic.trim()} onPress={() => { void generate(); }} />
   {busy ? <Text style={s.muted}>{t('lessonWait')}</Text> : null}
  </Card> : <Button label={t('lessonNew')} icon="plus" kind="secondary" disabled={exporting} onPress={() => router.push('/lessons')} />}
  <ErrorBox error={error} />
  {id && detail.isPending ? <Loading /> : null}<ErrorBox error={detail.error} />
  {content ? <>
   <Card><Badge label={`${content.game.subject} · ${content.game.grade} · ${content.game.language.toUpperCase()}`} success /><Text style={s.title}>{content.game.title}</Text><Text style={s.muted}>{t('lessonReviewNotice')}</Text>
    <View style={s.row}><Button label={t('lessonDownloadMaterial')} icon="download" kind="secondary" disabled={exporting || Platform.OS !== 'web'} onPress={() => { void exportFile('material'); }} /><Button label={t('lessonDownloadSlides')} icon="monitor" kind="secondary" disabled={exporting || Platform.OS !== 'web'} onPress={() => { void exportFile('slides'); }} /><Button label={t('lessonDownloadVideo')} icon="film" kind="secondary" disabled={exporting || !videoSupported()} onPress={() => { void exportFile('video'); }} /></View>
    <Text style={s.muted}>{t(Platform.OS !== 'web' ? 'export_web_only' : !videoSupported() ? 'video_unsupported' : 'lessonVideoHint')}</Text>
    {video !== null ? <View style={s.row}><Text accessibilityLiveRegion="polite" style={s.body}>{t('lessonVideoProgress')} {video}%</Text><Button label={t('cancel')} kind="secondary" onPress={() => videoAbort.current?.abort()} /></View> : null}
   </Card>
   <Choices label={t('lessonContents')} value={tab} options={[{ value: 'material', label: t('source') }, { value: 'tasks', label: t('items') }, { value: 'slides', label: t('lessonSlides') }]} onChange={setTab} />
   {tab === 'material' ? <>
    <Card><Text style={s.subtitle}>{t('lessonObjectives')}</Text>{content.objectives.map((goal, i) => <Text key={i} style={s.body}>• {goal}</Text>)}</Card>
    {content.sections.map((section, i) => <Card key={i}><Text style={s.subtitle}>{section.heading}</Text><Text selectable style={s.body}>{section.body}</Text></Card>)}
    <Card><Text style={s.subtitle}>{t('lessonGlossary')}</Text>{content.glossary.map((term, i) => <Text selectable key={i} style={s.body}><Text style={{ fontWeight: '700' }}>{term.term}: </Text>{term.definition}</Text>)}</Card>
    <Card><Text style={s.subtitle}>{t('lessonHomework')}</Text><Text selectable style={s.body}>{content.homework}</Text></Card>
   </> : tab === 'slides' ? content.slides.map((slide, i) => <Card key={i} style={{ backgroundColor: colors.ink }}><Text style={{ color: '#BEB5F7' }}>{i + 1}/{content.slides.length}</Text><Text style={[s.subtitle, { color: 'white' }]}>{slide.title}</Text>{slide.bullets.map((bullet, j) => <Text key={j} style={[s.body, { color: '#E5E7F0' }]}>• {bullet}</Text>)}<Text style={{ color: '#BEB5F7', lineHeight: 23 }}>{slide.notes}</Text></Card>) : <>
    <Card><Text style={s.body}>{content.game.instructions}</Text><Button label={t('lessonOpenGame')} icon="edit" disabled={exporting} onPress={() => router.push({ pathname: '/create', params: { id: detail.data!.gameId } })} /></Card>
    {content.game.items.map((item, i) => <Card key={item.id}><Text style={s.subtitle}>{i + 1}. {'question' in item ? item.question : 'prompt' in item ? item.prompt : `${item.left.text} → ${item.right.text}`}</Text>{'options' in item ? item.options.map(option => <Text key={option.id} style={s.body}>• {option.text}</Text>) : null}<Text style={s.muted}>{item.explanation}</Text></Card>)}
   </>}
  </> : null}
  <Text style={s.subtitle}>{t('lessonSaved')}</Text><ErrorBox error={lessons.error} />{lessons.isPending ? <Loading /> : null}
  {!lessons.isPending && !lessons.data?.length ? <Text style={s.muted}>{t('lessonEmpty')}</Text> : lessons.data?.map(lesson => <Card key={lesson.id}><Text style={s.subtitle}>{lesson.title}</Text><Text style={s.muted}>{lesson.subject} · {lesson.grade} · {lesson.language.toUpperCase()}</Text><Button label={t('open')} kind="secondary" disabled={exporting} onPress={() => router.push({ pathname: '/lessons', params: { id: lesson.id } })} /></Card>)}
 </>;
}
export default function Lessons() { const { t, user } = useApp(); return <Page title={t('lessonStudio')} subtitle={t('lessonSubtitle')}><RequireLogin><LessonStudio key={user?.id ?? 'guest'} /></RequireLogin></Page>; }
