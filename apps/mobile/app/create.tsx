import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import { DraftSchema, GenerationSchema, demoGame, demoSource, evidenceIssues, type Draft, type GameContent, type GameDetail, type GenerationInput } from '@oquplay/shared';
import { api, ApiError } from '../src/api';
import { useApp } from '../src/context';
import { Badge, Button, Card, Choices, colors, ErrorBox, Field, Loading, Page, RequireLogin, s } from '../src/ui';
import { Editor, Preview } from '../src/Editor';
import { generationSettings } from '../src/generation';

function Builder({ initialId }: { initialId?: string }) {
 const { t, lang, user, mode } = useApp(), router = useRouter(), qc = useQueryClient();
 const [id, setId] = useState(initialId), [revision, setRevision] = useState(1), [step,setStep] = useState(0);
 const [form,setForm] = useState<GenerationInput>({ source:'', subject:'', topic:'', grade:6, language:lang, difficulty:'A', gameType:'quiz', count:5 });
 const [content,setContent] = useState<GameContent | null>(null), [isDemo,setIsDemo] = useState(false), [timeLimit,setTimeLimit] = useState<number | null>(null);
 const [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(), [notice,setNotice] = useState(''), [reviewed,setReviewed] = useState(false), [preview,setPreview] = useState(false), [shareCode,setShareCode] = useState<string | null>(null);
 const loaded = useRef(false), request = useRef<{ fingerprint:string; key:string } | null>(null);
 const existing = useQuery({ queryKey:['game',initialId], queryFn:()=>api<GameDetail>(`/games/${initialId}`), enabled:!!initialId });
 useEffect(()=>{ if(existing.data&&!loaded.current){ const g=existing.data;setContent(g.draft);setIsDemo(g.isDemo);setRevision(g.revision);setTimeLimit(g.timeLimitSec);setShareCode(g.shareCode);setForm({source:g.source,subject:g.draft.subject,topic:g.draft.title,grade:g.draft.grade,language:g.draft.language,difficulty:g.draft.difficulty,gameType:g.draft.gameType,count:5});setStep(2);loaded.current=true;} },[existing.data]);
 const change = <K extends keyof GenerationInput>(key:K,value:GenerationInput[K]) => {setForm(f=>({...f,[key]:value}));setReviewed(false);setNotice('');};
 function loadDemo() { const sample=demoGame(form.gameType,form.language);setForm(f=>({...f,source:demoSource(f.language),subject:sample.subject,topic:sample.title,grade:6,difficulty:'A',count:5}));setError(undefined);setNotice(t('demoFixed')); }
 async function generate(replaceItemId?:string) {
  setBusy(true);setError(undefined);setNotice('');
  const settings=generationSettings(form,content,mode,replaceItemId);
  const body={settings,...(replaceItemId?{existing:content,replaceItemId}:{})};
  const parsed=GenerationSchema.safeParse(settings);if(!parsed.success){setError(new ApiError('validation_error',parsed.error.issues.map(i=>({path:i.path as (string|number)[],message:i.message}))));setBusy(false);return;}
  const fingerprint=JSON.stringify(body);if(!request.current||request.current.fingerprint!==fingerprint)request.current={fingerprint,key:randomUUID()};
  try { const result=await api<Draft>('/generations',{method:'POST',key:request.current.key,body});setContent(result.content);setForm(f=>({...f,source:result.source}));setIsDemo(result.isDemo);setReviewed(false);setStep(2);request.current=null; }
  catch(e){setError(e);if(!(e instanceof ApiError)||!['network_error','generation_running'].includes(e.code))request.current=null;}
  finally{setBusy(false);}
 }
 function validate():Draft | null {
  const parsed=DraftSchema.safeParse({content,source:form.source,timeLimitSec:timeLimit,isDemo});
  if(!parsed.success){setError(new ApiError('validation_error',parsed.error.issues.map(i=>({path:i.path as (string|number)[],message:i.message}))));return null;}
  const fields=evidenceIssues(parsed.data.content,parsed.data.source);if(fields.length){setError(new ApiError('validation_error',fields));return null;}return parsed.data;
 }
 async function persist():Promise<{id:string;revision:number}> {
  const draft=validate();if(!draft)throw new ApiError('validation_error');
  const result=await api<{id:string;revision:number}>(id?`/games/${id}`:'/games',{method:id?'PUT':'POST',body:{...draft,...(id?{revision}:{})}});
  setId(result.id);setRevision(result.revision);await qc.invalidateQueries({queryKey:['games']});return result;
 }
 async function save(action:'save'|'publish'|'practice') {
  setError(undefined);setNotice('');if(!validate())return;setBusy(true);
  try {const stored=await persist();if(action==='publish'){const share=await api<{code:string}>(`/games/${stored.id}/publish`,{method:'POST',body:{reviewed:true,revision:stored.revision}});setShareCode(share.code);await qc.invalidateQueries({queryKey:['games']});setNotice(t('success'));}
   else if(action==='practice'){const attempt=await api<{id:string}>(`/games/${stored.id}/practice`,{method:'POST',key:randomUUID()});router.push({pathname:'/play',params:{id:attempt.id}});}
   else setNotice(t('saved'));
  }catch(e){setError(e);}finally{setBusy(false);}
 }
 const webOrigin=Platform.OS==='web'&&typeof window!=='undefined'?window.location.origin:process.env.EXPO_PUBLIC_WEB_URL;
 async function copy(value:string){try{await Clipboard.setStringAsync(value);setNotice(t('copied'));}catch{setError('network_error');}}
 if(initialId&&existing.isPending)return <Loading />;
 if(existing.error)return <ErrorBox error={existing.error} />;
 if(preview&&content)return <Preview content={content} onClose={()=>setPreview(false)} />;
 return <>
  <View style={s.row}>{(['source','settings','review']as const).map((label,i)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={`${t('step')} ${i+1}: ${t(label)}`} disabled={busy||i===2&&!content} onPress={()=>{setStep(i);setError(undefined);}} style={{flexGrow:1,borderRadius:12,backgroundColor:step===i?colors.ink:'white',padding:16,borderWidth:1,borderColor:colors.border}}><Text style={{fontWeight:'700',color:step===i?'white':colors.muted}}>{i+1}. {t(label)}</Text></Pressable>)}</View>
  {mode==='demo'?<Card style={{backgroundColor:colors.pale}}><Badge label={t('demo')} /><Text style={s.body}>{t('demoInfo')}</Text>{step!==2?<Button label={t('demoLoad')} kind="secondary" disabled={busy} onPress={loadDemo} />:null}</Card>:null}
  {step===0?<Card><Field label={t('source')} hint={t('sourceHint')} value={form.source} onChangeText={v=>change('source',v)} multiline maxLength={18000} placeholder={t('materialPlaceholder')} style={{minHeight:280,lineHeight:26}} /><Text style={s.muted}>{form.source.length} {t('textCount')}</Text><Button label={t('next')} disabled={form.source.trim().length<80} icon="arrow-right" onPress={()=>setStep(1)} /></Card>:null}
  {step===1?<Card><Field label={t('subject')} value={form.subject} onChangeText={v=>change('subject',v)} maxLength={100} /><Field label={t('topic')} value={form.topic} onChangeText={v=>change('topic',v)} maxLength={160} /><Choices label={t('grade')} value={form.grade} options={Array.from({length:12},(_,i)=>({value:i+1,label:String(i+1)}))} onChange={v=>change('grade',v)} />
   <Choices label={t('language')} value={form.language} options={[{value:'kk',label:'Қазақша'},{value:'ru',label:'Русский'}]} onChange={v=>change('language',v)} /><Choices label={t('difficulty')} value={form.difficulty} options={(['A','B','C']as const).map(v=>({value:v,label:t(`level${v}`)}))} onChange={v=>change('difficulty',v)} />
   <Choices label={t('type')} value={form.gameType} options={(['quiz','matching','ordering']as const).map(v=>({value:v,label:t(v)}))} onChange={v=>change('gameType',v)} /><Choices label={t(form.gameType==='quiz'?'countQuiz':form.gameType==='matching'?'countMatching':'countOrdering')} value={form.count} options={([5,10,15]as const).map(v=>({value:v,label:String(v)}))} onChange={v=>change('count',v)} />
   <Choices label={t('timer')} value={timeLimit===null?'off':'on'} options={[{value:'off',label:t('off')},{value:'on',label:t('on')}]} onChange={v=>setTimeLimit(v==='off'?null:300)} />{timeLimit!==null?<Field label={t('minutes')} value={String(timeLimit/60)} keyboardType="numeric" onChangeText={v=>{const n=Number(v);setTimeLimit(Number.isFinite(n)?n*60:0);}} />:null}
   <View style={s.row}><Button label={t('back')} kind="secondary" disabled={busy} onPress={()=>setStep(0)} /><Button label={t(busy?'generating':'generate')} icon="zap" busy={busy} onPress={()=>{void generate();}} /></View>{busy?<Text style={s.muted}>{t('generationWait')}</Text>:null}
  </Card>:null}
  <ErrorBox error={error} />{notice?<Badge label={notice} success />:null}
  {step===2&&content?<><View style={s.row}><Badge label={`${t(content.gameType)} · ${content.grade} · ${content.difficulty}`} /><Button label={t('preview')} kind="secondary" icon="eye" disabled={busy} onPress={()=>{setError(undefined);if(validate())setPreview(true);}} /></View>
   <View pointerEvents={busy?'none':'auto'}><Editor content={content} onChange={g=>{setContent(g);setReviewed(false);setNotice('');}} regenerate={taskId=>{void generate(taskId);}} busy={busy} /></View>
   <Card><Choices label={t('timer')} value={timeLimit===null?'off':'on'} options={[{value:'off',label:t('off')},{value:'on',label:t('on')}]} onChange={v=>{setTimeLimit(v==='off'?null:300);setReviewed(false);}} />{timeLimit!==null?<Field label={t('minutes')} value={String(timeLimit/60)} keyboardType="numeric" onChangeText={v=>{setTimeLimit(Number(v)*60);setReviewed(false);}} />:null}
    {user?.role==='TEACHER'?<><Pressable accessibilityRole="checkbox" aria-checked={reviewed} accessibilityState={{checked:reviewed}} accessibilityLabel={t('publishCheck')} onPress={()=>setReviewed(!reviewed)} style={[s.row,{alignItems:'flex-start',paddingVertical:12}]}><Text style={{fontSize:24,color:colors.violet}}>{reviewed?'☑':'☐'}</Text><Text style={[s.body,{flex:1}]}>{t('publishCheck')}</Text></Pressable><Text style={s.muted}>{t('publishInfo')}</Text></>:<Text style={s.muted}>{t('privatePractice')}</Text>}
    <ErrorBox error={error} /><View style={s.row}><Button label={t('save')} icon="save" busy={busy} onPress={()=>{void save('save');}} /><Button label={t('practice')} kind="secondary" icon="play" disabled={busy} onPress={()=>{void save('practice');}} />{user?.role==='TEACHER'?<Button label={t('publish')} icon="share-2" disabled={!reviewed||busy} onPress={()=>{void save('publish');}} />:null}</View>
   </Card>
  </>:null}
  {shareCode?<Card><Text style={s.subtitle}>{t('share')}</Text><Text selectable style={{fontSize:22,fontWeight:'800',letterSpacing:2,color:colors.violet}}>{shareCode}</Text><Text style={s.muted}>{t('codePrivate')}</Text>{!webOrigin?<Text style={s.muted}>{t('webLinkUnavailable')}</Text>:null}<View style={s.row}><Button label={t('copyCode')} kind="secondary" onPress={()=>{void copy(shareCode);}} /><Button label={t('copyLink')} kind="secondary" disabled={!webOrigin} onPress={()=>{if(webOrigin)void copy(`${webOrigin.replace(/\/$/,'')}/join?code=${shareCode}`);}} /><Button label={t('analytics')} kind="ghost" onPress={()=>router.push({pathname:'/analytics',params:{id}})} /></View></Card>:null}
 </>;
}
export default function Create(){const{id}=useLocalSearchParams<{id?:string}>(),{t}=useApp();return <Page title={t(id?'edit':'create')} subtitle={t('createHint')}><RequireLogin><Builder key={id??'new'} initialId={id} /></RequireLogin></Page>;}
